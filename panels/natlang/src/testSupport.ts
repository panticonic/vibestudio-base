import type {
  CallDetail,
  CallRecordJson,
  CallSummary,
  NatlangEvaluationRecord,
  NatlangListCallsFilter,
  NatlangLiveDelivery,
  NatlangLiveFilter,
} from "@workspace/natlang-records/contract";
import type { NatlangLiveSubscription, NatlangRecordsClient } from "@workspace/natlang-records/client";
import type { EvalOutcome, NatlangPanelPorts, PanelFs } from "./ports.js";

/** An in-memory workspace filesystem over a flat map of paths. */
export function memoryFs(files: Record<string, string> = {}): PanelFs & { files: Record<string, string>; writes: string[] } {
  const writes: string[] = [];
  const children = (directory: string) => {
    const found = new Map<string, boolean>();
    const prefix = directory === "." ? "" : `${directory}/`;
    for (const path of Object.keys(files)) {
      if (!path.startsWith(prefix)) continue;
      const [first, ...rest] = path.slice(prefix.length).split("/");
      found.set(first!, found.get(first!) === true || rest.length > 0);
    }
    return found;
  };
  const isDirectory = (path: string) => path === "." || children(path).size > 0;
  return {
    files,
    writes,
    async readFile(path) {
      const text = files[path];
      if (text === undefined) throw new Error(`ENOENT ${path}`);
      return text;
    },
    async writeFile(path, data) {
      writes.push(path);
      files[path] = data;
    },
    readdir: (async (path: string, options?: { recursive?: boolean }) => {
      if (options?.recursive) {
        const prefix = path === "." ? "" : `${path}/`;
        const found = Object.keys(files)
          .filter((file) => file.startsWith(prefix))
          .map((file) => file.slice(prefix.length));
        if (found.length === 0) throw new Error(`ENOENT ${path}`);
        return found;
      }
      const entries = children(path);
      if (entries.size === 0) throw new Error(`ENOENT ${path}`);
      return [...entries].map(([name, directory]) => ({ name, isDirectory: () => directory }));
    }) as PanelFs["readdir"],
    async stat(path) {
      if (path in files) return { isDirectory: () => false, size: files[path]!.length };
      if (!isDirectory(path)) throw new Error(`ENOENT ${path}`);
      return { isDirectory: () => true };
    },
    async mkdir() {
      return undefined;
    },
    async exists(path) {
      return path in files || isDirectory(path);
    },
  };
}

/** A call summary with every field the listings read. */
export function summary(overrides: Partial<CallSummary> & { call_id: string }): CallSummary {
  return {
    parent_call_id: null,
    definition_id: "triage.classify",
    definition_name: "classify",
    definition_key: "key-1",
    definition_source: "classify.nl",
    executor: "agent",
    model_id: "local:lfm3-1.7b",
    outcome: "done",
    started_at: "2026-11-01T10:00:00.000Z",
    wall_ms: 1200,
    tokens_in: 100,
    tokens_out: 20,
    approach_hash: null,
    program_root: "skills/triage",
    audit_of: null,
    run_label: null,
    owner_kind: "agent",
    owner_key: "agent-1",
    agent_ref: "agent:alpha",
    channel_id: "channel-1",
    run_id: null,
    ...overrides,
  };
}

interface Subscriber {
  filter: NatlangLiveFilter;
  push(delivery: NatlangLiveDelivery): void;
  end(): void;
  fail(error: Error): void;
}

/** A records service in memory: calls, values, annotations, evaluations, and a live fan-out like the real one. */
export class FakeRecords implements NatlangRecordsClient {
  calls: CallSummary[] = [];
  details = new Map<string, Partial<CallDetail>>();
  values = new Map<string, string>();
  evaluations: NatlangEvaluationRecord[] = [];
  annotated: Array<{ callId: string; kind: string; value: unknown }> = [];
  feedbacks: Array<{ callId: string; verdict: string; expected?: unknown }> = [];
  tune = "";
  tuneExample: unknown = null;
  readonly subscribers = new Set<Subscriber>();
  /** Every subscription ever opened, in order, with its filter. */
  readonly opened: NatlangLiveFilter[] = [];
  readonly log: string[] = [];

  async begin(): Promise<void> {}
  async progress(): Promise<void> {}
  async discard(): Promise<void> {}
  async record(): Promise<{ recordId: string }> {
    throw new Error("not used");
  }
  async listCalls(filter: NatlangListCallsFilter = {}): Promise<CallSummary[]> {
    return this.calls
      .filter((call) => (filter.definition === undefined ? true : [call.definition_id, call.definition_name, call.definition_source].includes(filter.definition)))
      .filter((call) => filter.outcome === undefined || call.outcome === filter.outcome)
      .filter((call) => filter.runId === undefined || call.run_id === filter.runId)
      .filter((call) => filter.parentCallId === undefined || call.parent_call_id === filter.parentCallId)
      .sort((a, b) => (a.started_at < b.started_at ? 1 : -1))
      .slice(0, filter.limit ?? 100);
  }
  async getCall(callId: string): Promise<CallDetail | null> {
    const call = this.calls.find((candidate) => candidate.call_id === callId);
    if (!call) return null;
    const detail = this.details.get(callId);
    return { record: null, events: null, annotations: [], ...detail, summary: call };
  }
  async getValue(hash: string): Promise<string | null> {
    return this.values.get(hash) ?? null;
  }
  async annotate(input: { callId: string; kind: string; value: unknown }): Promise<void> {
    this.annotated.push(input);
  }
  async feedback(input: { callId: string; verdict: "good" | "bad" | "fix"; expected?: unknown }) {
    this.feedbacks.push(input);
    return { message: `annotated ${input.callId} as ${input.verdict}`, example: this.tuneExample as never };
  }
  async importExamples(): Promise<{ added: number; updated: number; unchanged: number }> {
    throw new Error("not used");
  }
  async tuneExamples(): Promise<{ jsonl: string; count: number }> {
    return { jsonl: this.tune, count: this.tune ? this.tune.trim().split("\n").length : 0 };
  }
  async liveInterest(): Promise<{ subscribed: boolean }> {
    return { subscribed: this.subscribers.size > 0 };
  }
  async stats() {
    return { calls: this.calls.length, running: 0, evaluations: this.evaluations.length, blobBytes: 4096, blobBudgetBytes: 256 * 1024 * 1024 };
  }
  async recordEvaluation(): Promise<{ evaluationId: string }> {
    throw new Error("not used");
  }
  async listEvaluations(): Promise<NatlangEvaluationRecord[]> {
    return this.evaluations;
  }

  /** Deliver events to the subscribers whose filter matches, as the service's publish does. */
  async publishLive(input: { owner: NatlangLiveDelivery["owner"]; runId?: string; events: NatlangLiveDelivery["events"] }): Promise<{ delivered: number }> {
    let delivered = 0;
    for (const subscriber of [...this.subscribers]) {
      if (subscriber.filter.runId !== undefined && subscriber.filter.runId !== input.runId) continue;
      subscriber.push({ owner: input.owner, ...(input.runId ? { runId: input.runId } : {}), events: input.events });
      delivered += 1;
    }
    return { delivered };
  }

  async subscribeLive(filter: NatlangLiveFilter = {}): Promise<NatlangLiveSubscription> {
    this.opened.push(filter);
    this.log.push(`subscribe ${JSON.stringify(filter)}`);
    const queue: NatlangLiveDelivery[] = [];
    let wake: (() => void) | undefined;
    let done = false;
    let failure: Error | null = null;
    const subscriber: Subscriber = {
      filter,
      push: (delivery) => {
        queue.push(delivery);
        wake?.();
      },
      end: () => {
        done = true;
        wake?.();
      },
      fail: (error) => {
        failure = error;
        wake?.();
      },
    };
    this.subscribers.add(subscriber);
    const subscribers = this.subscribers;
    const log = this.log;
    return {
      subscriptionId: `sub-${this.opened.length}`,
      deliveries: (async function* () {
        for (;;) {
          while (queue.length) yield queue.shift()!;
          if (failure) throw failure;
          if (done) return;
          await new Promise<void>((resolve) => (wake = resolve));
          wake = undefined;
        }
      })(),
      async close() {
        log.push(`close ${JSON.stringify(filter)}`);
        subscribers.delete(subscriber);
        subscriber.end();
      },
    };
  }
}

export type EvalHandler = (source: string, options: { runId: string; signal?: AbortSignal }) => Promise<EvalOutcome> | EvalOutcome;

/** Ports over fakes. `handle` answers eval runs; by default every run succeeds with no value. */
export function fakePorts(
  options: {
    files?: Record<string, string>;
    handle?: EvalHandler;
    records?: FakeRecords;
    resolveRole?: NatlangPanelPorts["settings"]["resolveRole"];
  } = {}
) {
  const fs = memoryFs({ ...options.files });
  const records = options.records ?? new FakeRecords();
  const evaluated: Array<{ source: string; runId: string }> = [];
  let sequence = 0;
  const ports: NatlangPanelPorts = {
    fs,
    records,
    settings: {
      resolveRole:
        options.resolveRole ??
        (async (role) => ({
          role: role as "executor",
          ref: "local:lfm3-1.7b",
          source: "local",
          model: { ref: "local:lfm3-1.7b", name: "LFM3 1.7B", provider: "local", contextWindow: 32768, availability: { state: "ready" } } as never,
          reason: "The local executor model is installed.",
        })),
    },
    localModels: {
      async status() {
        return {
          role: "owner",
          owner: null,
          hardware: { os: "linux", arch: "x64", gpus: [], cpu: { cores: 8, features: [] }, ramMB: 32768, usableRamMB: 24000, chosenBackend: "cpu", chosenGpu: null, tier: "cpu-strong", probedAt: 0, notes: [] },
          engine: { pin: { buildTag: "b12067", manifestSha256: "abc123" }, cpu: { buildTag: "b12067", backend: "cpu", dir: "/e", serverBinPath: "/e/llama-server", smokeTestedAt: 0 }, gpu: null, degradedReason: null },
          servers: { utility: { state: "stopped" }, main: { state: "running", port: 1, loadedModels: ["lfm3-1.7b"], uptimeMs: 1 } },
          fallback: { ready: true, warm: true, modelRef: "local:lfm3-1.7b", downloadSizeBytes: 0, reason: null },
          downloads: [],
          storageRoot: "/s",
          diskFreeBytes: 1,
        } as never;
      },
      async listModels() {
        return [
          {
            slug: "lfm3-1.7b",
            displayName: "LFM3 1.7B",
            baseUrl: "http://127.0.0.1:1/v1",
            server: "main",
            contextWindow: 32768,
            maxTokens: 4096,
            toolsCapable: true,
            reasoningCapable: false,
            fit: { fit: "cpu-only", estTokensPerSec: 30, contextLength: 32768, gpuLayers: 0, notes: [] },
            measuredTokensPerSec: 28,
            state: "ready",
            download: null,
            errorMessage: null,
          },
        ];
      },
      async openManagement() {},
    },
    evaluate: async (source, run) => {
      evaluated.push({ source, runId: run.runId });
      return (await (options.handle ?? (() => ({ success: true, console: "" })))(source, run)) as EvalOutcome;
    },
    owner: { kind: "panel", objectKey: "panel-1" },
    newId: () => `id-${++sequence}`,
  };
  return { ports, fs, records, evaluated };
}

/** A natlang record of a finished call, with its values stored in `records`. */
export function addFinishedCall(
  records: FakeRecords,
  call: Partial<CallSummary> & { call_id: string },
  content: { inputs?: Record<string, unknown>; output?: unknown; events?: unknown[]; detail?: string } = {}
): CallRecordJson {
  const store = (value: unknown) => {
    const text = JSON.stringify(value);
    const hash = `h-${records.values.size + 1}`;
    records.values.set(hash, text);
    return { complete: true, hash, bytes: text.length };
  };
  const row = summary(call);
  records.calls.push(row);
  const record = {
    version: "natlang.calls/1",
    call_id: row.call_id,
    parent_call_id: row.parent_call_id,
    parent_action_index: null,
    task_id: "t",
    program_id: "triage",
    program_root: row.program_root,
    definition: { id: row.definition_id, name: row.definition_name, source: row.definition_source, key: row.definition_key, interface: "i", site: "named", instructions: store("Classify.") },
    executor: { kind: "agent", model_id: row.model_id },
    inputs: Object.fromEntries(Object.entries(content.inputs ?? { text: "hello" }).map(([name, value]) => [name, store(value)])),
    captures: {},
    output: store(content.output ?? "billing"),
    effects: [],
    capture_writes: [],
    outcome: row.outcome,
    detail: content.detail ?? "",
    started_at: row.started_at,
    ended_at: row.started_at,
    cost: { model_requests: 1, tokens_in: row.tokens_in ?? 0, tokens_out: row.tokens_out ?? 0, wall_ms: row.wall_ms ?? 0, turns: 1, evals: 0 },
    approach: { hash: null },
    events: null,
  } as unknown as CallRecordJson;
  records.details.set(row.call_id, {
    record,
    events: (content.events ?? []).map((event) => JSON.stringify(event)).join("\n") || null,
  });
  return record;
}
