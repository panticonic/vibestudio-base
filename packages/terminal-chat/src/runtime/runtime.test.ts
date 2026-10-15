import { afterEach, describe, expect, it, vi } from "vitest";
import type { MethodExecutionContext } from "@workspace/pubsub";
import type { ChatRpc, SessionStateStore, TerminalChatBootstrap } from "./bootstrap.js";
import { ChatRuntime } from "./chatRuntime.js";
import { ProviderSignIn } from "./providerSignIn.js";
import { schemaRpcClientMock } from "@vibestudio/rpc/test-utils";
import { durableObjectServiceFixture } from "@vibestudio/service-schemas/test-utils";
import type { RpcCallOptions } from "@vibestudio/rpc";
import {
  getProviderConnectMethod,
  toCredentialConnectRequest,
} from "@vibestudio/shared/providerConnect";
import { encodeEventWatchRecord } from "@vibestudio/shared/events";
import { ChatActions, type ActionUi, type PromptSpec } from "../app/actions.js";

const credential = {
  id: "cred",
  label: "Test connection",
  audience: [],
  injection: {
    type: "header",
    name: "Authorization",
    valueTemplate: "Bearer {token}",
  },
  scopes: [],
  lifecycle: { state: "active", canRefresh: false },
};

class MemoryState implements SessionStateStore {
  value: Record<string, unknown> = {};
  listeners = new Set<() => void>();
  get = () => this.value;
  async patch(partial: Record<string, unknown>) {
    const next = { ...this.value };
    for (const [key, entry] of Object.entries(partial)) {
      if (entry === null) delete next[key];
      else next[key] = entry;
    }
    this.value = next;
    for (const listener of this.listeners) listener();
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

function fakeRpc(
  handlers: Record<string, (args: unknown[], signal?: AbortSignal | null) => unknown> = {}
) {
  const events = new Map<string, Parameters<ChatRpc["on"]>[1]>();
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const activeStreams = new Set<ReadableStreamDefaultController<Uint8Array>>();
  const recoveryHandlers = new Set<Parameters<ChatRpc["onRecovery"]>[0]>();
  const rpc = schemaRpcClientMock(
    {
      call: async (_target: string, name: string, args: unknown[], options?: RpcCallOptions) => {
        calls.push({ method: name, args });
        const handler = Object.entries(handlers).find(([key]) => name.includes(key))?.[1];
        if (handler) return handler(args, options?.signal);
        if (name === "workers.resolveService") {
          const models = String(args[0]).includes("model-settings");
          const source = models ? "workers/model-settings" : "workers/pubsub-channel";
          const className = models ? "ModelSettingsDO" : "PubSubChannel";
          const objectKey = models ? "workspace" : String(args[1]);
          return durableObjectServiceFixture(`do:${source}:${className}:${objectKey}`, {
            source,
            className,
            objectKey,
          });
        }
        if (name === "getSettings")
          return {
            catalog: { providers: [], models: [] },
            defaultModel: "openai-codex:gpt-6-luna",
            defaultModelSource: "fallback",
            defaultAgentConfig: { model: "openai-codex:gpt-6-luna" },
          };
        if (name === "workers.listSources" || name === "getParticipants") return [];
        if (name === "getConfig") return null;
        if (name === "unsubscribe") return undefined;
        throw new Error(`unavailable in this test: ${name}`);
      },
      streamReadable: async (_target, method, args, options) => {
        const encoder = new TextEncoder();
        let ended = false;
        let abort = () => {};
        let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            streamController = controller;
            activeStreams.add(controller);
            abort = () => {
              if (!ended) {
                ended = true;
                activeStreams.delete(controller);
                controller.close();
              }
            };
            options?.signal?.addEventListener("abort", abort, { once: true });
            if (options?.signal?.aborted) {
              abort();
              return;
            }
            if (method === "subscribe") {
              controller.enqueue(
                encoder.encode(
                  `${JSON.stringify({ kind: "subscribed", result: { ok: true, participantId: String(args[0]), envelope: { mode: "after", logEvents: [], snapshots: [], ready: { contextId: (args[1] as Record<string, unknown>)["contextId"], totalCount: 0, envelopeCount: 0, hasMoreBefore: false } } } })}\n`
                )
              );
            } else if (method === "events.watch") {
              controller.enqueue(
                encodeEventWatchRecord({
                  kind: "watching",
                  events: ["shell-approval:pending-changed"],
                  epoch: "test",
                })
              );
            } else throw new Error(`Unexpected stream ${method}`);
          },
          cancel() {
            ended = true;
            if (streamController) activeStreams.delete(streamController);
            options?.signal?.removeEventListener("abort", abort);
          },
        });
        return { status: 200, statusText: "OK", headers: [], finalUrl: "", body };
      },
    },
    "code:terminal-chat"
  );
  rpc.onRecovery = (handler) => {
    recoveryHandlers.add(handler);
    return () => recoveryHandlers.delete(handler);
  };
  rpc.on = (event, listener) => {
    events.set(event, listener);
    return () => events.delete(event);
  };
  return {
    rpc,
    calls,
    activeStreams,
    recoveryHandlers,
    emitRecovery: (kind: Parameters<Parameters<ChatRpc["onRecovery"]>[0]>[0]) => {
      for (const handler of recoveryHandlers) handler(kind);
    },
    emit: (event: string, payload: unknown) =>
      events.get(event)?.({
        payload,
        event,
        caller: { callerId: "main", callerKind: "server" },
        origin: { callerId: "main", callerKind: "server" },
      }),
  };
}

function boot(state = new MemoryState(), rpc = fakeRpc().rpc): TerminalChatBootstrap {
  return {
    rpc,
    contextId: "ctx-home",
    sessionId: "s1",
    state,
    files: {
      read: async () => ({ name: "", mimeType: "", bytes: new Uint8Array() }),
      writeExport: async () => "",
    },
  };
}

const runtimes: ChatRuntime[] = [];
afterEach(async () => {
  const results = await Promise.allSettled(runtimes.splice(0).map((runtime) => runtime.dispose()));
  const errors = results.flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
  if (errors.length) throw new AggregateError(errors, "Test runtime cleanup failed");
});

async function start(state = new MemoryState()) {
  const runtime = new ChatRuntime(boot(state));
  runtimes.push(runtime);
  await runtime.start();
  return runtime;
}

describe("ChatRuntime", () => {
  it("opens the committed destination after joined source retirement reports an error", async () => {
    const failure = new Error("source membership leave rejected");
    let failed = false;
    const fixture = fakeRpc({
      unsubscribe: () => {
        if (!failed) {
          failed = true;
          throw failure;
        }
      },
    });
    const state = new MemoryState();
    state.value = { channelName: "chat-original" };
    const runtime = new ChatRuntime(boot(state, fixture.rpc));
    runtimes.push(runtime);
    await runtime.start();
    await vi.waitFor(() => expect(runtime.actionSession?.getSnapshot().connected).toBe(true));
    const oldSession = runtime.actionSession;
    const oldStreams = [...fixture.activeStreams];
    expect(oldStreams.length).toBeGreaterThan(0);
    await expect(runtime.newConversation()).rejects.toThrow("Conversation cleanup failed");
    expect(runtime.actionSession).not.toBeNull();
    expect(runtime.actionSession).not.toBe(oldSession);
    expect(runtime.operationSignal.aborted).toBe(false);
    expect(oldStreams.every((stream) => !fixture.activeStreams.has(stream))).toBe(true);
    expect(fixture.recoveryHandlers.size).toBe(1);
    await runtime.newConversation();
    expect(runtime.actionSession).not.toBeNull();
  });

  it("keeps the active session and draft when durable navigation fails", async () => {
    const state = new MemoryState();
    state.value = { channelName: "chat-original" };
    const runtime = await start(state);
    const original = runtime.getSnapshot();
    original.session!.setInput("unsent original");
    await vi.waitFor(() => expect(runtime.getSnapshot().composer.text).toBe("unsent original"));
    const failure = new Error("durable selection rejected");
    vi.spyOn(state, "patch").mockRejectedValueOnce(failure);
    await expect(runtime.newConversation()).rejects.toBe(failure);
    expect(runtime.getSnapshot()).toMatchObject({
      generation: original.generation,
      session: original.session,
      composer: { text: "unsent original" },
    });
    expect(runtime.operationSignal.aborted).toBe(false);
  });

  it("restores each conversation's draft after switching and restarting", async () => {
    const state = new MemoryState();
    state.value = { channelName: "chat-original" };
    const runtime = await start(state);
    runtime.actionSession!.setInput("original draft 🦊");
    await runtime.openConversation("chat-other", "ctx-other");
    expect(runtime.getSnapshot().composer.text).toBe("");
    runtime.actionSession!.setInput("other draft");
    await runtime.openConversation("chat-original", "ctx-home");
    expect(runtime.actionSession!.getSnapshot().input).toBe("original draft 🦊");
    await runtime.dispose();
    const again = await start(state);
    expect(again.getSnapshot().composer.text).toBe("original draft 🦊");
    await again.openConversation("chat-other", "ctx-other");
    expect(again.actionSession!.getSnapshot().input).toBe("other draft");
  });

  it("joins a late file read without attaching it to the destination", async () => {
    let finish!: (file: { name: string; mimeType: string; bytes: Uint8Array }) => void;
    let readSignal: AbortSignal | undefined;
    const fixture = fakeRpc();
    const bootstrap = boot(new MemoryState(), fixture.rpc);
    bootstrap.files.read = (_path, options) => {
      readSignal = options?.signal;
      return new Promise((resolve) => {
        finish = resolve;
      });
    };
    const runtime = new ChatRuntime(bootstrap);
    runtimes.push(runtime);
    await runtime.start();
    const attaching = runtime.attachFile("old.txt");
    const rejected = attaching.catch((error: unknown) => error);
    const navigation = runtime.newConversation();
    await vi.waitFor(() => expect(readSignal?.aborted).toBe(true));
    finish({
      name: "old.txt",
      mimeType: "text/plain",
      bytes: new Uint8Array([65]),
    });
    expect(await rejected).toBe(readSignal!.reason);
    await navigation;
    expect(runtime.getSnapshot().composer.attachments).toEqual([]);
    expect(fixture.calls.some((call) => call.method === "blobstore.putRetained")).toBe(false);
  });

  it("invalidates delayed prompt callbacks instead of recapturing the new conversation", async () => {
    const runtime = await start();
    const read = vi.spyOn(runtime.files, "read");
    let prompt!: PromptSpec;
    const ui: ActionUi = {
      openPrompt: (value) => {
        prompt = value;
      },
      openPicker: vi.fn(),
      openHelp: vi.fn(),
      openQueue: vi.fn(),
      closeOverlay: vi.fn(),
      setDraft: vi.fn(),
      copy: vi.fn(),
      settingsChanged: vi.fn(),
      selectMessage: vi.fn(),
    };
    new ChatActions(runtime, ui).attach("");
    await runtime.newConversation();
    await prompt.onSubmit("old-path.txt");
    expect(read).not.toHaveBeenCalled();
    expect(runtime.getSnapshot().composer.attachments).toEqual([]);
    expect(runtime.getSnapshot().notices).toEqual([]);
  });

  it("allows an owned navigation to retire its own origin without joining itself", async () => {
    const runtime = await start();
    const generation = runtime.getSnapshot().generation;
    const stale = runtime.bindConversationCallback(() =>
      runtime.notify({ tone: "info", title: "stale" })
    );
    const callback = runtime.bindConversationCallback(async () => {
      await runtime.newConversation();
      runtime.notify({ tone: "success", title: "navigation completed" });
    });
    await callback();
    expect(runtime.getSnapshot().generation).toBe(generation + 1);
    await stale();
    expect(runtime.getSnapshot().notices.map((notice) => notice.title)).toEqual([
      "navigation completed",
    ]);
  });

  it("joins an initiating action's sibling work before transferring only its navigation continuation", async () => {
    const runtime = await start();
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let siblingSignal!: AbortSignal;
    let siblingFailure: unknown;
    const navigating = runtime.runInConversation(async () => {
      const sibling = runtime.runInConversation(async () => {
        siblingSignal = runtime.operationSignal;
        await held;
        runtime.notify({ tone: "info", title: "stale sibling" });
      });
      void sibling.catch((error: unknown) => {
        siblingFailure = error;
      });
      await runtime.newConversation();
      runtime.notify({ tone: "success", title: "destination continuation" });
    });
    await vi.waitFor(() => expect(siblingSignal.aborted).toBe(true));
    expect(runtime.getSnapshot().session).toBeNull();
    release();
    await navigating;
    expect(siblingFailure).toBe(siblingSignal.reason);
    expect(runtime.getSnapshot().notices.map((notice) => notice.title)).toEqual([
      "destination continuation",
    ]);
  });

  it("completes the actual fork command's destination notice under the new owner", async () => {
    const runtime = await start();
    const session = runtime.actionSession!;
    const forks = session.forks;
    if (!forks) throw new Error("Terminal sessions must expose canonical forks");
    vi.spyOn(forks.getSnapshot().actions, "newFork").mockImplementation(() =>
      runtime.openConversation("chat-fork", "ctx-fork")
    );
    const ui: ActionUi = {
      openPrompt: vi.fn(),
      openPicker: vi.fn(),
      openHelp: vi.fn(),
      openQueue: vi.fn(),
      closeOverlay: vi.fn(),
      setDraft: vi.fn(),
      copy: vi.fn(),
      settingsChanged: vi.fn(),
      selectMessage: vi.fn(),
    };
    new ChatActions(runtime, ui).run("fork", "");
    await vi.waitFor(() =>
      expect(runtime.getSnapshot().notices).toContainEqual(
        expect.objectContaining({
          title: "Forked",
          message: "You are in the new fork. /forks switches back.",
        })
      )
    );
    expect(runtime.getSnapshot().contextId).toBe("ctx-fork");
  });

  it("forwards the bootstrap's recovery lifecycle to its conversation host", async () => {
    const fixture = fakeRpc();
    const runtime = new ChatRuntime(boot(new MemoryState(), fixture.rpc));
    runtimes.push(runtime);
    await runtime.start();
    expect(fixture.recoveryHandlers.size).toBe(1);
    fixture.emitRecovery("resubscribe");
    await runtime.dispose();
    await vi.waitFor(() => expect(fixture.recoveryHandlers.size).toBe(0));
    fixture.emitRecovery("cold-recover");
  });

  it("mints a conversation in the session's context and opens a session on it", async () => {
    const state = new MemoryState();
    const runtime = await start(state);
    await Promise.resolve();
    const snapshot = runtime.getSnapshot();
    expect(snapshot.contextId).toBe("ctx-home");
    expect(snapshot.host?.channelName).toMatch(/^chat-/);
    const persisted = state.value["terminalChat"] as {
      current: string;
      conversations: Record<string, { host: { channelName: string } }>;
    };
    await vi.waitFor(() =>
      expect(
        (state.value["terminalChat"] as typeof persisted).conversations[persisted.current]!.host
          .channelName
      ).toBe(snapshot.host?.channelName)
    );
    expect(snapshot.session?.getSnapshot().channelName).toBe(snapshot.host?.channelName);
  });

  it("starts a new conversation with a fresh channel and no inherited agents", async () => {
    const state = new MemoryState();
    state.value = {
      channelName: "chat-old",
      installedAgents: [{ handle: "ai" }],
    };
    const runtime = await start(state);
    const first = runtime.getSnapshot();
    expect(first.host?.channelName).toBe("chat-old");
    await runtime.newConversation();
    const next = runtime.getSnapshot();
    expect(next.generation).toBe(first.generation + 1);
    expect(next.host?.channelName).not.toBe("chat-old");
    expect(state.value["installedAgents"]).toBeUndefined();
    expect(next.session).not.toBe(first.session);
  });

  it("opens a fork in its own context with the fork's own agents, and remembers it across restarts", async () => {
    const state = new MemoryState();
    state.value = { installedAgents: [{ handle: "ai-chat", key: "ai-1" }] };
    const cloned = "do:workers/agent-worker:AiChatWorker:ai-1~fork~abc";
    const runtime = new ChatRuntime(
      boot(
        state,
        fakeRpc({
          getParticipants: () => [
            {
              participantId: cloned,
              metadata: { type: "agent", handle: "ai-chat" },
            },
          ],
        }).rpc
      )
    );
    runtimes.push(runtime);
    await runtime.start();
    await runtime.openConversation("chat-fork", "ctx-fork");
    const persisted = state.value["terminalChat"] as {
      current: string;
      conversations: Record<string, { contextId: string; host: { installedAgents: unknown } }>;
    };
    expect(persisted.conversations[persisted.current]!.host.installedAgents).toEqual([
      {
        agentId: "AiChatWorker",
        handle: "ai-chat",
        key: "ai-1~fork~abc",
        source: "workers/agent-worker",
        className: "AiChatWorker",
      },
    ]);
    expect(runtime.getSnapshot().contextId).toBe("ctx-fork");
    expect(persisted.conversations[persisted.current]!.contextId).toBe("ctx-fork");
    const again = await start(state);
    expect(again.getSnapshot().contextId).toBe("ctx-fork");
    expect(again.getSnapshot().host?.channelName).toBe("chat-fork");
  });

  it("advertises feedback_form only, and turns a call into a pending form until answered or cancelled", async () => {
    const runtime = await start();
    const session = runtime.getSnapshot().session!;
    const methods = session.methods.compose();
    expect(Object.keys(methods)).toEqual(["feedback_form"]);
    const abort = new AbortController();
    const ctx = {
      callId: "c1",
      callerId: "ai",
      signal: abort.signal,
    } as unknown as MethodExecutionContext;
    const answered = methods["feedback_form"]!.execute({ title: "Q", fields: [] }, ctx);
    expect(runtime.getSnapshot().forms.map((f) => f.id)).toEqual(["c1"]);
    runtime.getSnapshot().forms[0]!.answer({ type: "submit", value: { a: 1 } });
    await expect(answered).resolves.toEqual({
      type: "submit",
      value: { a: 1 },
    });
    expect(runtime.getSnapshot().forms).toEqual([]);

    const cancelled = methods["feedback_form"]!.execute(
      { title: "Q2", fields: [] },
      { ...ctx, callId: "c2" }
    );
    abort.abort();
    await expect(cancelled).resolves.toEqual({ type: "cancel" });
  });

  it("keeps a bounded list of notices", async () => {
    const runtime = await start();
    for (let i = 0; i < 8; i++) runtime.notify({ tone: "info", title: `n${i}` });
    expect(runtime.getSnapshot().notices.map((n) => n.title)).toEqual([
      "n3",
      "n4",
      "n5",
      "n6",
      "n7",
    ]);
    runtime.dismissNotice();
    expect(runtime.getSnapshot().notices).toHaveLength(4);
  });
});

describe("ProviderSignIn", () => {
  it("hands API-key input to the protected credential approval, never to chat", async () => {
    let complete!: (value: unknown) => void;
    const { rpc, calls } = fakeRpc({
      "credentials.connect": (_args, signal) =>
        new Promise((resolve, reject) => {
          complete = resolve;
          signal?.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        }),
    });
    const signIn = new ProviderSignIn(rpc, { afterConnected: vi.fn() });
    const provider = ProviderSignIn.providers().find(
      (entry) => getProviderConnectMethod(entry.id)?.flow.type === "api-key"
    )!;
    expect(provider).toBeDefined();
    const connected = signIn.connect(provider.id);
    expect(signIn.getSnapshot()).toMatchObject({
      phase: "protected-input",
      providerId: provider.id,
    });
    await vi.waitFor(() =>
      expect(calls.some((call) => call.method === "credentials.connect")).toBe(true)
    );
    const request = calls.find((call) => call.method === "credentials.connect")!;
    expect(request.args).toEqual([
      expect.objectContaining({
        flow: expect.objectContaining({ type: "api-key" }),
      }),
    ]);
    expect(request.args).toEqual([
      toCredentialConnectRequest(provider.id, { browser: "external" }),
    ]);
    complete(credential);
    await expect(connected).resolves.toBe(true);
    await signIn.cancel();
  });

  it("explains providers it cannot connect from a terminal", async () => {
    const signIn = new ProviderSignIn(fakeRpc().rpc, {
      afterConnected: () => {},
    });
    await signIn.connect("no-such-provider");
    expect(signIn.getSnapshot()).toMatchObject({
      phase: "error",
      title: "Can't connect No Such Provider here",
      message: expect.stringContaining("Known providers:"),
    });
  });

  it("shows the authorize link, validates the pasted callback, and completes", async () => {
    let finish!: (value: unknown) => void;
    const { rpc, calls, emit } = fakeRpc({
      "credentials.connect": () => new Promise((resolve) => (finish = resolve)),
      "credentials.forwardOAuthCallback": () => {
        finish(credential);
        return undefined;
      },
    });
    let connected = 0;
    const signIn = new ProviderSignIn(rpc, {
      afterConnected: () => connected++,
    });
    const provider = ProviderSignIn.providers().find(
      (p) => getProviderConnectMethod(p.id)?.flow.type !== "api-key"
    )!;
    const done = signIn.connect(provider.id);
    expect(signIn.getSnapshot().phase).toBe("starting");
    emit("external-open:open", {
      url: "https://auth.example.com/authorize?x=1",
      oauthLoopback: {
        transactionId: "t1",
        redirectUri: "http://localhost:1455/callback",
        state: "s-123",
      },
    });
    expect(signIn.getSnapshot()).toMatchObject({
      phase: "waiting",
      url: "https://auth.example.com/authorize?x=1",
      callbackOrigin: "http://localhost:1455",
    });
    await signIn.paste("not a url");
    expect(signIn.getSnapshot()).toMatchObject({
      phase: "waiting",
      pasteError: expect.stringContaining("not a web address"),
    });
    await signIn.paste("http://localhost:1455/callback?code=c&state=other");
    expect(signIn.getSnapshot()).toMatchObject({
      pasteError: expect.stringContaining("different sign-in"),
    });
    await signIn.paste("http://localhost:1455/callback?code=c&state=s-123");
    await expect(done).resolves.toBe(true);
    expect(signIn.getSnapshot()).toMatchObject({ phase: "done" });
    expect(connected).toBe(1);
    expect(calls.find((c) => c.method.includes("forwardOAuthCallback"))?.args).toEqual([
      {
        transactionId: "t1",
        url: "http://localhost:1455/callback?code=c&state=s-123",
        state: "s-123",
      },
    ]);
  });

  it("cancels the server transaction when the person gives up", async () => {
    const { rpc, calls, emit } = fakeRpc({
      "credentials.connect": (_args, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        }),
      "credentials.cancelOAuth": () => undefined,
    });
    const signIn = new ProviderSignIn(rpc, { afterConnected: () => {} });
    const provider = ProviderSignIn.providers().find(
      (p) => getProviderConnectMethod(p.id)?.flow.type !== "api-key"
    )!;
    const connecting = signIn.connect(provider.id);
    emit("external-open:open", {
      url: "https://a",
      oauthLoopback: {
        transactionId: "t9",
        redirectUri: "http://localhost:1/cb",
        state: "s",
      },
    });
    await signIn.cancel();
    await expect(connecting).resolves.toBe(false);
    expect(signIn.getSnapshot().phase).toBe("idle");
    expect(calls.some((c) => c.method.includes("cancelOAuth"))).toBe(true);
  });
});
