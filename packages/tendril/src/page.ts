/**
 * `@workspace/tendril/page` — the page side of a tendril (tendrils plan §5.3).
 *
 *   import { connectTendril, mountTendrilControl } from "@workspace/tendril/page";
 *   const tendril = await connectTendril();
 *
 * A tendril page is an ordinary panel opened with `stateArgs.tendril`. It joins
 * the tendril's channel as itself, so everything it sends is stamped by the
 * channel with its verified origin (panel source, slot, device). Shared state
 * lives in TendrilDO; events and instructions live in the channel.
 */
import type { RpcCaller } from "@vibestudio/rpc";
import { connectViaRpc, type PubSubClient } from "@workspace/pubsub";
import {
  AGENTIC_EVENT_PAYLOAD_KIND,
  AGENTIC_PROTOCOL_VERSION,
  OBSERVATIONS_WITHHELD_SIGNAL,
  type AgenticEvent,
} from "@workspace/agentic-protocol";
import { mainRpcMethods } from "@vibestudio/service-schemas/mainRpc";
import { createRpcMethodCaller } from "@vibestudio/shared/rpcMethods";
import {
  TENDRIL_EVENT,
  TENDRIL_RECORD,
  TENDRIL_STATE_SIGNAL,
  TendrilEventPayloadSchema,
  TendrilStateSignalSchema,
  tendrilFailureOccurrenceKey,
  type BlobRef,
  type StateOp,
  type TendrilFunctionDecl,
  type TendrilPresentationRef,
  type TendrilStateSignal,
} from "./protocol.js";
import {
  applyOps,
  assertPathAllowed,
  cloneJson,
  getPath,
  mergePatchToOps,
  rebase,
  toPath,
  type StatePath,
  type StateRoot,
} from "./state.js";
import { createOutbox, type OutboxItem, type OutboxStorage } from "./outbox.js";
import { SPEECH_EXTENSION, SPEECH_MAX_PCM_BYTES } from "@workspace/speech";
import { transcribeRecording } from "@workspace/speech/transcribe";
import { readTendrilStateArgs, tendrilRpcMethods, tendrilTargetId } from "./do-contract.js";

export type AgentStatus = {
  state: "idle" | "working" | "waiting" | "unattached";
  /** Observations the agent's wake bound held back since someone last talked to it. */
  withheld: number;
};
export type HapticKind = "light" | "medium" | "heavy" | "success" | "warning" | "error";
export type TendrilDevice = {
  id: string | null;
  label: string;
  platform: "desktop" | "mobile" | "headless";
};

export interface Tendril {
  readonly id: string;
  readonly slotId: string;
  readonly device: TendrilDevice;
  /** Report an event. `wake: false` records it without waking the agent. */
  send(data: unknown, opts?: { wake?: boolean; blobs?: BlobRef[] }): Promise<{ queued: boolean }>;
  /** A person's instruction, spoken or typed into the control. */
  instruct(text: string, via: "voice" | "text"): Promise<void>;
  readonly state: {
    get(path?: StatePath): unknown;
    set(path: StatePath, value: unknown): void;
    delete(path: StatePath): void;
    patch(mergePatch: Record<string, unknown>): void;
    on(fn: (state: StateRoot, ops: StateOp[], by: string) => void): () => void;
  };
  /** A function the agent (and voice) can call on this page. */
  expose(
    name: string,
    decl: Omit<TendrilFunctionDecl, "name">,
    fn: (args: any) => unknown,
  ): () => void;
  upload(blob: Blob, opts?: { name?: string }): Promise<BlobRef>;
  readonly agent: {
    status(): AgentStatus;
    on(fn: (status: AgentStatus) => void): () => void;
  };
  readonly native: TendrilNative;
  /**
   * Record what the person says and return the text. Recording ends when `stop`
   * settles (push-to-talk), when they go quiet after speaking, or at the
   * speech extension's one-minute limit. Needs voice input prepared in the
   * workspace (the chat microphone offers that once).
   */
  listen(opts?: { signal?: AbortSignal; stop?: Promise<unknown> }): Promise<string>;
  /** Called by the kit's control; pages rarely need it. */
  functions(): ReadonlyArray<TendrilFunctionDecl>;
  call(name: string, args?: unknown): Promise<unknown>;
  readonly outbox: { readonly size: number };
  close(): Promise<void>;
}

export interface TendrilNative {
  readonly supported: string[];
  keepAwake(on: boolean): Promise<void>;
  haptic(kind: HapticKind): Promise<void>;
  speak(text: string, opts?: { lang?: string }): Promise<void>;
}

/** The slice of `@workspace/runtime` the kit uses; injectable for tests. */
export interface TendrilPageRuntime {
  rpc: Pick<RpcCaller, "call" | "stream"> & {
    readonly selfId: string;
    expose(
      method: string,
      handler: (request: { args: unknown[] }) => unknown,
      website: { kind: "closed"; reason: string },
    ): void;
  };
  panel: {
    readonly slotId: string;
    readonly entityId: string;
    readonly stateArgs: { get(): unknown };
    getInfo(): Promise<{ device?: TendrilDevice }>;
  };
  connect?(opts: Parameters<typeof connectViaRpc>[0]): PubSubClient;
  storage?: OutboxStorage | null;
  window?: Window | null;
}

const CLOSED = {
  kind: "closed",
  reason: "Tendril page functions are for the workspace's own agents.",
} as const;
const CONSOLE_LIMIT = 200;

/** Connect the current panel to its tendril. */
export async function connectTendril(runtime?: TendrilPageRuntime): Promise<Tendril> {
  const rt: TendrilPageRuntime =
    runtime ?? ((await import("@workspace/runtime")) as unknown as TendrilPageRuntime);
  const win = rt.window !== undefined ? rt.window : typeof window === "undefined" ? null : window;
  const args = readTendrilStateArgs(await rt.panel.stateArgs.get());
  const info = await rt.panel.getInfo();
  const device: TendrilDevice = info.device ?? { id: null, label: "This device", platform: "desktop" };
  const ref: TendrilPresentationRef = {
    tendrilId: args.tendrilId,
    slotId: rt.panel.slotId,
    deviceId: device.id,
  };
  const tendrilDo = createRpcMethodCaller(rt.rpc, tendrilTargetId(args.tendrilId), tendrilRpcMethods);
  const callMain = (method: string, params: unknown[]) =>
    rt.rpc.call("main", (mainRpcMethods as unknown as Record<string, never>)[method]!, params);

  // ── Console capture for tendril.console ────────────────────────────────
  const consoleEntries: { seq: number; level: string; text: string; at: number }[] = [];
  let consoleSeq = 0;
  const record = (level: string, values: unknown[]) => {
    consoleEntries.push({
      seq: ++consoleSeq,
      level,
      text: values.map((v) => (typeof v === "string" ? v : safeJson(v))).join(" "),
      at: Date.now(),
    });
    if (consoleEntries.length > CONSOLE_LIMIT) consoleEntries.shift();
  };
  const restoreConsole = captureConsole(record);

  // ── Channel ────────────────────────────────────────────────────────────
  const client = (rt.connect ?? connectViaRpc)({
    rpc: rt.rpc as never,
    channel: args.channelId,
    contextId: args.contextId,
    name: device.label,
    type: "panel",
    metadata: { tendril: ref } as never,
    replayMode: "stream",
  });
  await client.ready();

  // ── Shared state: authoritative snapshot + our unacknowledged ops ──────
  let authoritative: StateRoot = {};
  let authoritativeRev = 0;
  /** Another writer got in between: take the snapshot once the queue drains. */
  let staleSnapshot = false;
  let view: StateRoot = {};
  const stateListeners = new Set<(s: StateRoot, ops: StateOp[], by: string) => void>();
  const pendingState = () =>
    outbox.pending().filter((item): item is Extract<OutboxItem, { kind: "state" }> => item.kind === "state");
  const recompute = (ops: StateOp[], by: string) => {
    view = rebase(authoritative, pendingState());
    for (const fn of stateListeners) fn(view, ops, by);
  };
  const refetchState = async () => {
    const snapshot = await tendrilDo("getState", []);
    authoritative = snapshot.state;
    authoritativeRev = snapshot.rev;
    recompute([], "snapshot");
  };

  // ── Outbound queue ─────────────────────────────────────────────────────
  const outbox = createOutbox({
    storage: rt.storage !== undefined ? rt.storage : (win?.localStorage ?? null),
    storageKey: `tendril-outbox:${args.tendrilId}:${rt.panel.slotId}`,
    deliver: async (item) => {
      if (item.kind === "publish") {
        await client.publish(item.type, item.payload, { idempotencyKey: item.cid });
      } else {
        const { rev } = await tendrilDo("applyState", [{ cid: item.cid, ops: item.ops }]);
        // Fold our acknowledged write in now, so the view never steps back
        // between the acknowledgement and its live signal.
        if (rev === authoritativeRev + 1) {
          authoritative = applyOps(authoritative, item.ops);
          authoritativeRev = rev;
        } else if (rev > authoritativeRev) {
          staleSnapshot = true;
        }
      }
    },
    onError: (error) => record("warn", ["[tendril] queued until reconnect:", error]),
  });
  client.onReconnect(() => {
    void outbox.flush().then(refetchState, () => {});
  });

  // ── Agent status ───────────────────────────────────────────────────────
  let status: AgentStatus = { state: hasAgent(client) ? "idle" : "unattached", withheld: 0 };
  const statusListeners = new Set<(s: AgentStatus) => void>();
  const setStatus = (next: Partial<AgentStatus>) => {
    status = { ...status, ...next };
    for (const fn of statusListeners) fn(status);
  };
  client.onRoster(() => {
    if (!hasAgent(client)) setStatus({ state: "unattached" });
    else if (status.state === "unattached") setStatus({ state: "idle" });
  });

  const abort = new AbortController();
  void (async () => {
    try {
      for await (const event of client.events({
        includeReplay: false,
        includeSignals: true,
        signal: abort.signal,
      })) {
        if (event.type === "replay-complete") continue;
        if (event.type === "signal") {
          if (event.contentType === TENDRIL_STATE_SIGNAL) {
            const parsed = TendrilStateSignalSchema.safeParse(safeParse(event.content));
            if (!parsed.success || parsed.data.tendrilId !== args.tendrilId) continue;
            const signal = parsed.data as TendrilStateSignal;
            if (signal.rev <= authoritativeRev) continue; // already seen
            if (signal.rev !== authoritativeRev + 1) {
              await refetchState(); // missed one: take the snapshot
              continue;
            }
            authoritative = applyOps(authoritative, signal.ops);
            authoritativeRev = signal.rev;
            recompute(signal.ops, signal.by);
          } else if (event.contentType === OBSERVATIONS_WITHHELD_SIGNAL) {
            const count = Number((safeParse(event.content) as { count?: unknown })?.count);
            if (Number.isFinite(count)) setStatus({ withheld: count });
          }
          continue;
        }
        if (event.type !== AGENTIC_EVENT_PAYLOAD_KIND) continue;
        const agentic = (event as { payload: AgenticEvent }).payload;
        if (agentic.kind === "turn.opened" || agentic.kind === "turn.resumed")
          setStatus({ state: "working" });
        else if (agentic.kind === "turn.waiting") setStatus({ state: "waiting" });
        else if (agentic.kind === "turn.closed") setStatus({ state: "idle" });
        else if (agentic.kind === "message.completed" && event.senderId.startsWith("user:"))
          setStatus({ withheld: 0 });
      }
    } catch (error) {
      if (!abort.signal.aborted) record("error", ["[tendril] channel stream ended:", error]);
    }
  })();

  await refetchState();
  await outbox.flush();

  // ── Presentation and functions ─────────────────────────────────────────
  await tendrilDo("registerPresentation", [
    { slotId: rt.panel.slotId, deviceId: device.id, label: device.label },
  ]);
  const functions = new Map<string, { decl: TendrilFunctionDecl; fn: (args: any) => unknown }>();
  let registering: Promise<void> | null = null;
  const registerFunctions = () => {
    registering ??= Promise.resolve().then(async () => {
      registering = null;
      await tendrilDo("registerFunctions", [
        rt.panel.slotId,
        [...functions.values()].map((entry) => entry.decl),
      ]);
    });
    return registering;
  };
  const callFunction = async (name: string, fnArgs: unknown) => {
    const entry = functions.get(name);
    if (!entry)
      throw new Error(`No function "${name}" on this page; exposed: ${[...functions.keys()].join(", ") || "none"}`);
    return entry.fn(fnArgs ?? {});
  };

  // ── RPC the agent reaches through the panel handle ─────────────────────
  rt.rpc.expose(
    "tendril.eval",
    async ({ args: [input] }) => {
      const code = String((input as { code?: unknown })?.code ?? "");
      const from = consoleSeq;
      try {
        const value = await runInPage(code, tendril, win);
        return { ok: true, value: toJsonValue(value), console: consoleEntries.filter((e) => e.seq > from) };
      } catch (error) {
        return { ok: false, error: describeError(error), console: consoleEntries.filter((e) => e.seq > from) };
      }
    },
    CLOSED,
  );
  rt.rpc.expose(
    "tendril.snapshot",
    () => ({
      text: win?.document.body?.innerText ?? "",
      html: win?.document.documentElement.outerHTML ?? "",
    }),
    CLOSED,
  );
  rt.rpc.expose(
    "tendril.console",
    ({ args: [input] }) => {
      const after = Number((input as { after?: unknown })?.after ?? 0);
      return { entries: consoleEntries.filter((e) => e.seq > after) };
    },
    CLOSED,
  );
  rt.rpc.expose(
    "tendril.fn",
    ({ args: [input] }) => {
      const { name, args: fnArgs } = (input ?? {}) as { name?: string; args?: unknown };
      return callFunction(String(name ?? ""), fnArgs);
    },
    CLOSED,
  );

  // ── Failure reporting (ui.feedback, once per build and message) ────────
  const agentTarget = () => {
    for (const [participantId, participant] of Object.entries(client.roster)) {
      if ((participant.metadata as { type?: string }).type === "agent")
        return { kind: "agent" as const, id: participantId, participantId };
    }
    return null;
  };
  let currentBuildKey: string | null = null;
  const reportFailure = async (
    buildKey: string,
    category: "render_failed" | "compile_failed" | "load_stalled",
    message: string,
    extra: { name?: string; stack?: string } = {},
  ) => {
    const target = agentTarget();
    if (!target) return;
    const occurrenceKey = await tendrilFailureOccurrenceKey(buildKey, message);
    const event: AgenticEvent<"ui.feedback"> = {
      kind: "ui.feedback",
      actor: { kind: "panel", id: rt.panel.slotId },
      payload: {
        protocol: AGENTIC_PROTOCOL_VERSION,
        target,
        to: [{ kind: "participant", participantId: target.participantId }],
        category,
        refs: { component: `tendril ${args.tendrilId}` },
        error: { message, ...extra },
        occurrenceKey,
      },
      createdAt: new Date().toISOString(),
    } as AgenticEvent<"ui.feedback">;
    await outbox.push({
      cid: `ui-feedback:${occurrenceKey}`,
      kind: "publish",
      type: AGENTIC_EVENT_PAYLOAD_KIND,
      payload: event,
    });
  };
  // A build the host reverted away from never ran long enough to report itself.
  void (async () => {
    try {
      const proof = (await callMain("panelRuntime.historyProof", [rt.panel.slotId])) as {
        entityId: string;
        buildKey: string | null;
        state: string;
        failure: { code?: string; message?: string } | null;
      }[];
      currentBuildKey = proof.find((entry) => entry.entityId === rt.panel.entityId)?.buildKey ?? null;
      for (const entry of proof) {
        if (entry.state !== "failed" || !entry.buildKey) continue;
        const message = `An update to this page failed (${entry.failure?.code ?? "failed"}) and the page went back to its last working version: ${entry.failure?.message ?? "no message"}`;
        await reportFailure(entry.buildKey, "load_stalled", message);
      }
    } catch (error) {
      record("warn", ["[tendril] could not read update history:", error]);
    }
  })();
  const onError = (event: ErrorEvent) =>
    void reportFailure(currentBuildKey ?? rt.panel.entityId, "render_failed", event.message, {
      ...(event.error?.name ? { name: String(event.error.name) } : {}),
      ...(event.error?.stack ? { stack: String(event.error.stack) } : {}),
    });
  const onRejection = (event: PromiseRejectionEvent) =>
    void reportFailure(
      currentBuildKey ?? rt.panel.entityId,
      "render_failed",
      describeError(event.reason).message,
    );
  win?.addEventListener("error", onError);
  win?.addEventListener("unhandledrejection", onRejection);

  const newCid = () => `${rt.panel.slotId}:${crypto.randomUUID()}`;
  const pushState = (ops: StateOp[]) => {
    if (!ops.length) return;
    for (const op of ops) assertPathAllowed(op.path);
    const item: OutboxItem = { cid: newCid(), kind: "state", ops: cloneJson(ops) };
    const delivered = outbox.push(item); // enqueues synchronously; never rejects
    recompute(ops, "self");
    void delivered.then(async () => {
      if (!staleSnapshot || outbox.size > 0) return;
      staleSnapshot = false;
      await refetchState().catch(() => {
        staleSnapshot = true;
      });
    });
  };

  const tendril: Tendril = {
    id: args.tendrilId,
    slotId: rt.panel.slotId,
    device,
    async send(data, opts = {}) {
      const cid = newCid();
      const payload = TendrilEventPayloadSchema.parse({
        ...ref,
        cid,
        data,
        ...(opts.blobs?.length ? { blobs: opts.blobs } : {}),
      });
      const delivered = await outbox.push({
        cid,
        kind: "publish",
        type: opts.wake === false ? TENDRIL_RECORD : TENDRIL_EVENT,
        payload,
      });
      return { queued: !delivered };
    },
    async instruct(text, via) {
      await client.send(text, { metadata: { tendril: { ...ref, via } } });
      setStatus({ withheld: 0 });
    },
    state: {
      get: (path) => cloneJson(getPath(view, toPath(path))),
      set: (path, value) => pushState([{ op: "set", path: toPath(path), value: cloneJson(value) }]),
      delete: (path) => pushState([{ op: "delete", path: toPath(path) }]),
      patch: (mergePatch) => pushState(mergePatchToOps(view, mergePatch)),
      on(fn) {
        stateListeners.add(fn);
        return () => stateListeners.delete(fn);
      },
    },
    expose(name, decl, fn) {
      functions.set(name, { decl: { ...decl, name }, fn });
      void registerFunctions().catch((error) => record("warn", ["[tendril] registerFunctions:", error]));
      return () => {
        if (functions.get(name)?.fn !== fn) return;
        functions.delete(name);
        void registerFunctions().catch(() => {});
      };
    },
    async upload(blob, opts = {}) {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const put = (await callMain("blobstore.putBase64", [bytesToBase64(bytes)])) as {
        digest: string;
      };
      return {
        id: put.digest,
        mimeType: blob.type || "application/octet-stream",
        ...(opts.name ? { name: opts.name } : {}),
        size: bytes.byteLength,
      };
    },
    agent: {
      status: () => status,
      on(fn) {
        statusListeners.add(fn);
        return () => statusListeners.delete(fn);
      },
    },
    native: await createNative(win),
    async listen(opts = {}) {
      if (!win?.navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined")
        throw new Error("This page cannot record audio here");
      const status = (await callMain("extensions.invoke", [SPEECH_EXTENSION, "status", []])) as {
        ready?: boolean;
      };
      if (!status.ready)
        throw new Error(
          "Voice input is not prepared in this workspace yet. Prepare it once from the chat microphone.",
        );
      const signal = opts.signal ?? new AbortController().signal;
      const context = new AudioContext();
      try {
        const blob = await recordSpeech(win, context, signal, opts.stop);
        return await transcribeRecording(blob, context, rt.rpc, signal, () => {});
      } finally {
        void context.close().catch(() => {});
      }
    },
    functions: () => [...functions.values()].map((entry) => entry.decl),
    call: callFunction,
    outbox,
    async close() {
      abort.abort();
      win?.removeEventListener("error", onError);
      win?.removeEventListener("unhandledrejection", onRejection);
      restoreConsole();
      await tendrilDo("unregisterPresentation", [rt.panel.slotId]).catch(() => {});
      await client.close();
    },
  };
  return tendril;
}

function hasAgent(client: PubSubClient): boolean {
  return Object.values(client.roster).some(
    (participant) => (participant.metadata as { type?: string }).type === "agent",
  );
}

/**
 * The mobile shell's device bridge (capability `device-powers`) when granted, otherwise the web
 * platform: Screen Wake Lock, `navigator.vibrate`, `speechSynthesis`.
 */
async function createNative(win: Window | null): Promise<TendrilNative> {
  type Bridge = {
    capabilities(): Promise<string[]>;
    keepAwake(on: boolean): Promise<void>;
    haptic(kind: HapticKind): Promise<void>;
    speak(o: { text: string; lang?: string }): Promise<void>;
  };
  const bridge = (win as unknown as { __vibestudioShell?: { device?: Bridge } } | null)
    ?.__vibestudioShell?.device;
  const nav = win?.navigator as (Navigator & { wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> } }) | undefined;
  // A bridge whose host lacks the grant offers nothing; then the web APIs apply.
  const granted = bridge ? await bridge.capabilities().catch(() => [] as string[]) : [];
  const native = granted.length > 0 ? bridge : undefined;
  const supported = native
    ? granted
    : [
        ...(nav?.wakeLock ? ["keepAwake"] : []),
        ...(typeof nav?.vibrate === "function" ? ["haptic"] : []),
        ...(win && "speechSynthesis" in win ? ["speak"] : []),
      ];
  let lock: { release(): Promise<void> } | null = null;
  const unsupported = (what: string) =>
    Promise.reject(new Error(`${what} is not available on this device`));
  return {
    supported,
    async keepAwake(on) {
      if (native) return native.keepAwake(on);
      if (!nav?.wakeLock) return unsupported("keepAwake");
      if (on && !lock) lock = await nav.wakeLock.request("screen");
      if (!on && lock) {
        await lock.release();
        lock = null;
      }
    },
    async haptic(kind) {
      if (native) return native.haptic(kind);
      if (typeof nav?.vibrate !== "function") return unsupported("haptic");
      nav.vibrate(kind === "heavy" || kind === "error" ? 60 : kind === "medium" || kind === "warning" ? 30 : 12);
    },
    async speak(text, opts = {}) {
      if (native) return native.speak({ text, ...(opts.lang ? { lang: opts.lang } : {}) });
      if (!win || !("speechSynthesis" in win)) return unsupported("speak");
      await new Promise<void>((resolve, reject) => {
        const utterance = new SpeechSynthesisUtterance(text);
        if (opts.lang) utterance.lang = opts.lang;
        utterance.onend = () => resolve();
        utterance.onerror = (event) => reject(new Error(event.error));
        win.speechSynthesis.speak(utterance);
      });
    },
  };
}

/** Quiet after speech this long ends a recording. */
const END_OF_SPEECH_MS = 1200;
/** The speech extension takes at most one minute of 16 kHz PCM. */
const MAX_RECORDING_MS = (SPEECH_MAX_PCM_BYTES / 4 / 16000) * 1000 - 1000;
const SPEECH_LEVEL = 0.02;

async function recordSpeech(
  win: Window,
  context: AudioContext,
  signal: AbortSignal,
  stop: Promise<unknown> | undefined,
): Promise<Blob> {
  const stream = await win.navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });
  try {
    signal.throwIfAborted();
    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    const analyser = context.createAnalyser();
    context.createMediaStreamSource(stream).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    const stopped = new Promise<void>((resolve, reject) => {
      recorder.onstop = () => resolve();
      recorder.onerror = () => reject(new Error("The microphone could not record audio"));
    });
    const end = () => {
      if (recorder.state === "recording") recorder.stop();
    };
    const startedAt = Date.now();
    let heardAt: number | null = null;
    // Sample the input level to notice the end of speech.
    const level = win.setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) sum += sample * sample;
      const now = Date.now();
      if (Math.sqrt(sum / samples.length) > SPEECH_LEVEL) heardAt = now;
      if ((heardAt !== null && now - heardAt > END_OF_SPEECH_MS) || now - startedAt > MAX_RECORDING_MS)
        end();
    }, 100);
    void stop?.then(end, end);
    const onAbort = () => end();
    signal.addEventListener("abort", onAbort, { once: true });
    recorder.start();
    try {
      await stopped;
    } finally {
      win.clearInterval(level);
      signal.removeEventListener("abort", onAbort);
    }
    signal.throwIfAborted();
    if (heardAt === null) throw new Error("No speech detected. Try speaking closer to the microphone.");
    return new Blob(chunks, { type: recorder.mimeType });
  } finally {
    stream.getTracks().forEach((track) => track.stop());
  }
}

function captureConsole(record: (level: string, values: unknown[]) => void): () => void {
  const levels = ["log", "info", "warn", "error", "debug"] as const;
  const originals = levels.map((level) => console[level]);
  levels.forEach((level, i) => {
    console[level] = (...values: unknown[]) => {
      record(level, values);
      originals[i]!.apply(console, values);
    };
  });
  return () =>
    levels.forEach((level, i) => {
      console[level] = originals[i]!;
    });
}

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (
  ...params: string[]
) => (...args: unknown[]) => Promise<unknown>;

/** Run agent code in the page. A bare expression returns its value. */
async function runInPage(code: string, tendril: Tendril, win: Window | null): Promise<unknown> {
  let fn: (...args: unknown[]) => Promise<unknown>;
  try {
    fn = new AsyncFunction("tendril", "window", "document", `return (${code}\n);`);
  } catch {
    fn = new AsyncFunction("tendril", "window", "document", code);
  }
  return fn(tendril, win, win?.document);
}

function describeError(error: unknown): { name?: string; message: string; stack?: string } {
  if (error instanceof Error)
    return { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) };
  return { message: String(error) };
}

function toJsonValue(value: unknown): unknown {
  if (value === undefined) return null;
  try {
    return JSON.parse(JSON.stringify(value)) as unknown;
  } catch {
    return String(value);
  }
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
