import type { ModelExchange, ModelCaptureSession } from "./modelTurnCapture.js";
import { natlangCallCheckpointStateSchema } from "@workspace/natlang-records/contract";
import type { NatlangRecordsClient } from "@workspace/natlang-records/client";
import type {
  NatlangOwner,
  CallRecordJson,
  LiveEventJson,
} from "@workspace/natlang-records/contract";
import type { CallStoreLike, LiveEvent } from "../vendor/workerd/natlang-workerd.js";
import type { EvalNatlangCallSummary } from "@vibestudio/service-schemas/eval";

type CallStoreSettings = ReturnType<CallStoreLike["settings"]>;

/**
 * Compilations and specialization belong to a store that serves calls from stored
 * cases; this store only records, so every call runs on its model. Values are
 * recorded up to natlang's own default bound.
 */
const SETTINGS: CallStoreSettings = {
  maxValueBytes: 1 << 20,
  maxStoreBytes: 50 * 2 ** 30,
  minFreeBytes: 0,
  specialization: "off",
  auditRate: 0,
  acceptanceBound: 0.05,
  promotionComparisons: 10,
  promotionLiveComparisons: 3,
  minCalls: 20,
  promotionPolicy: "crisp",
  targetPolicy: "crisp",
  declinePolicy: "crisp",
};

/** Batched model text is sent once it reaches this size (a boundary event or the end of the run sends it sooner). */
const LIVE_TEXT_BATCH_CHARS = 512;

/** Longest `detail` a call summary carries; the full text is in the record. */
const SUMMARY_DETAIL_CHARS = 240;

/** The eval run the next records belong to. */
export interface RecordingRun {
  readonly runId: string;
  /** The root calls the run made, in the order their records arrived. */
  readonly calls: EvalNatlangCallSummary[];
  captureModelTurns?: boolean;
  executorModel?: string;
}

/**
 * natlang's call store (`CallStoreLike`) over the natlang records service.
 *
 * The store interface is synchronous and recording must never fail or slow a
 * ordinary call. Capture-enabled model exchange acknowledgements are strict;
 * the next semantic step waits for durability. Every write joins one ordered queue (`begin`, then `progress`, then
 * `record` of a call stay in order). A running call's progress is coalesced to
 * its latest events, and `flush()` is how an eval cell waits until its records
 * are durable. A write that fails is reported once per distinct message and the
 * call keeps going: the summary of an unrecorded call simply carries no record id.
 */
interface CaptureEpoch {
  run: RecordingRun;
  active: Set<string>;
  inFlight: Set<Promise<void>>;
  failure?: unknown;
  pendingStates: Map<string, unknown>;
  acknowledged: Map<string, number>;
}

export class RecordsStore implements CallStoreLike {
  private readonly modelTurns = new Map<string, ModelExchange[]>();
  private epoch: CaptureEpoch | null = null;
  private readonly callEpochs = new Map<string, CaptureEpoch>();
  private readonly retainedEpochs = new Set<CaptureEpoch>();

  get checkpointRequired(): boolean {
    return this.capturesModelTurns;
  }

  get capturesModelTurns(): boolean {
    return this.run?.captureModelTurns === true;
  }

  get capturedExecutorModel(): string | undefined {
    return this.run?.executorModel;
  }

  enableModelTurnCapture(options: { executorModel?: string } = {}): void {
    if (!this.run) throw new Error("model turn capture requires an executing eval run");
    if (
      options.executorModel !== undefined &&
      (typeof options.executorModel !== "string" || !options.executorModel.includes(":"))
    )
      throw new TypeError("capture executorModel must be an actual provider:id model reference");
    if (
      this.run.captureModelTurns &&
      this.run.executorModel &&
      options.executorModel &&
      options.executorModel !== this.run.executorModel
    )
      throw new Error(`Captured teacher is already pinned to ${this.run.executorModel}`);
    this.run.captureModelTurns = true;
    if (options.executorModel !== undefined) this.run.executorModel = options.executorModel;
  }

  async prepareModelExchange(request: unknown): Promise<ModelCaptureSession> {
    const epoch = this.epoch;
    const id = (request as { invocation_id?: unknown })?.invocation_id;
    if (!epoch || typeof id !== "string" || !epoch.active.has(id))
      throw new Error("Cannot request a captured model turn without its active call record");
    if (!this.retainEvidence)
      throw new Error("Captured inference requires the native emergency evidence sink");
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    epoch.inFlight.add(finished);
    try {
      await this.flushEpoch(epoch);
      if (this.epoch !== epoch || !epoch.active.has(id))
        throw new Error("Captured model attachment ended before inference");
    } catch (error) {
      epoch.inFlight.delete(finished);
      finish();
      throw error;
    }
    return {
      ...(epoch.run.executorModel ? { executorModel: epoch.run.executorModel } : {}),
      record: (exchange) => {
        if ((exchange.request as { invocation_id?: unknown })?.invocation_id !== id)
          throw new Error("Captured exchange belongs to another invocation");
        return this.captureModelExchange(exchange, epoch);
      },
      finish: () => {
        epoch.inFlight.delete(finished);
        finish();
      },
    };
  }

  async captureModelExchange(exchange: ModelExchange, capturedEpoch?: CaptureEpoch): Promise<void> {
    const id = (exchange.request as { invocation_id?: unknown })?.invocation_id;
    const epoch =
      capturedEpoch ?? (typeof id === "string" ? this.callEpochs.get(id) : undefined) ?? this.epoch;
    if (!epoch?.run.captureModelTurns) return;
    if (typeof id !== "string") throw new Error("natlang captured exchange has no invocation_id");
    if (capturedEpoch && this.callEpochs.has(id) && this.callEpochs.get(id) !== capturedEpoch)
      throw new Error("Captured exchange belongs to another attachment");
    const turns = this.modelTurns.get(id) ?? [];
    const ordinal = turns.length;
    turns.push(exchange);
    this.modelTurns.set(id, turns);
    this.callEpochs.set(id, epoch);
    const committed = this.queue.then(async () => {
      await this.records.appendExchange({ callId: id, ordinal, exchange });
      epoch.acknowledged.set(id, ordinal + 1);
    });
    this.queue = committed.then(
      () => undefined,
      (error) => this.captureError(epoch, "natlang exchange capture failed", error)
    );
    try {
      await committed;
    } catch (error) {
      await this.queue;
      throw error;
    }
  }

  private queue: Promise<void> = Promise.resolve();
  private readonly latestProgress = new Map<string, string>();
  private run: RecordingRun | null = null;
  private readonly reported = new Set<string>();

  constructor(
    private readonly records: NatlangRecordsClient,
    private readonly owner: NatlangOwner,
    private readonly report: (message: string) => void,
    private readonly retainEvidence?: (evidence: unknown) => Promise<void>
  ) {}

  /** The workspace folder of the program each running task executes, by task id. */
  readonly programRoots = new Map<string, string>();

  /** Attribute the records that arrive from now on to `run`. */
  attach(run: RecordingRun | null): void {
    if (run && this.run === run && this.epoch) return;
    const previous = this.epoch;
    if (
      previous &&
      previous.inFlight.size === 0 &&
      ![...this.callEpochs.values()].includes(previous)
    )
      this.retainedEpochs.delete(previous);
    this.run = run;
    this.epoch = run
      ? {
          run,
          active: new Set(),
          inFlight: new Set(),
          pendingStates: new Map(),
          acknowledged: new Map(),
        }
      : null;
    if (this.epoch) this.retainedEpochs.add(this.epoch);
  }

  private async flushEpoch(epoch: CaptureEpoch | null): Promise<void> {
    await this.queue;
    if (epoch?.run.captureModelTurns && "failure" in epoch) throw epoch.failure;
  }

  async flush(): Promise<void> {
    await this.flushEpoch(this.epoch);
  }

  /** Join capture ownership before teardown, including replies completed after cancellation. */
  async settleCaptures(run: RecordingRun): Promise<void> {
    const epoch = [...this.retainedEpochs].find((candidate) => candidate.run === run);
    if (!epoch) return;
    while (epoch.inFlight.size) await Promise.all([...epoch.inFlight]);
    await this.flushEpoch(epoch);
    if (![...this.callEpochs.values()].includes(epoch)) this.retainedEpochs.delete(epoch);
  }

  pendingCaptureEvidence(): unknown {
    return [...this.retainedEpochs]
      .filter((epoch) => epoch.run.captureModelTurns)
      .map((epoch) => this.evidenceFor(epoch));
  }

  private evidenceFor(epoch: CaptureEpoch): unknown {
    return {
      schema: "natlang.pending-model-exchanges/1",
      owner: this.owner,
      runId: epoch.run.runId,
      errors:
        "failure" in epoch
          ? [String(epoch.failure instanceof Error ? epoch.failure.message : epoch.failure)]
          : [],
      calls: [...this.callEpochs.entries()]
        .filter(([, owner]) => owner === epoch)
        .map(([callId]) => ({
          callId,
          model_turns: this.modelTurns.get(callId) ?? [],
          acknowledgedPrefix: epoch.acknowledged.get(callId) ?? 0,
          ...(epoch.pendingStates.has(callId) ? { pending: epoch.pendingStates.get(callId) } : {}),
        })),
    };
  }

  private async captureError(
    epoch: CaptureEpoch | null,
    prefix: string,
    error: unknown
  ): Promise<void> {
    if (epoch?.run.captureModelTurns) {
      epoch.failure = error;
      if (this.retainEvidence) {
        try {
          await this.retainEvidence(this.evidenceFor(epoch));
        } catch (retentionError) {
          this.fail("natlang emergency evidence retention failed", retentionError);
        }
      }
    }
    this.fail(prefix, error);
  }

  checkpoint(
    callId: string,
    state: Record<string, unknown>,
    blobs: ReadonlyMap<string, string>,
    events?: string
  ): Promise<void> | undefined {
    const epoch = this.callEpochs.get(callId) ?? this.epoch;
    if (!epoch?.run.captureModelTurns) return;
    const input = {
      callId,
      state: natlangCallCheckpointStateSchema.parse(state),
      blobs: Object.fromEntries(blobs),
      ...(events === undefined ? {} : { events }),
    };
    epoch.pendingStates.set(callId, { kind: "checkpoint", ...input });
    const committed = this.queue.then(async () => {
      if ("failure" in epoch) throw epoch.failure;
      await this.records.checkpoint(input);
      if ((epoch.pendingStates.get(callId) as { state?: unknown })?.state === input.state)
        epoch.pendingStates.delete(callId);
    });
    this.queue = committed.then(
      () => undefined,
      (error) => this.captureError(epoch, "natlang checkpoint failed", error)
    );
    return committed.catch(async (error) => {
      await this.queue;
      throw error;
    });
  }

  settings(): CallStoreSettings {
    return SETTINGS;
  }

  version(): number {
    return 0;
  }

  currentCompilation(): undefined {
    return undefined;
  }

  caseServed(): void {}

  enqueue(): void {}

  begin(row: Parameters<NonNullable<CallStoreLike["begin"]>>[0]): void {
    const runId = this.run?.runId;
    const epoch = this.epoch;
    epoch?.active.add(row.callId);
    if (epoch) this.callEpochs.set(row.callId, epoch);
    this.write("begin", () =>
      this.records.begin({
        owner: this.owner,
        ...(runId ? { runId } : {}),
        callId: row.callId,
        parentCallId: row.parentCallId,
        parentActionIndex: row.parentActionIndex,
        taskId: row.taskId,
        programId: row.programId,
        programRoot: row.programRoot ?? this.programRoots.get(row.taskId) ?? null,
        definition: row.definition,
        modelId: row.modelId,
        startedAt: row.startedAt,
        auditOf: row.auditOf,
        ...(row.runLabel ? { runLabel: row.runLabel } : {}),
      })
    );
  }

  progress(callId: string, events: string): void {
    const idle = !this.latestProgress.has(callId);
    this.latestProgress.set(callId, events);
    if (!idle) return;
    this.write(
      "progress",
      async () => {
        const latest = this.latestProgress.get(callId);
        this.latestProgress.delete(callId);
        if (latest !== undefined) await this.records.progress(callId, latest);
      },
      this.callEpochs.get(callId) ?? null
    );
  }

  discard(callId: string): void {
    this.callEpochs.get(callId)?.active.delete(callId);
    this.latestProgress.delete(callId);
    this.write(
      "discard",
      async () => {
        await this.records.discard(callId);
        if (!this.modelTurns.has(callId)) this.callEpochs.delete(callId);
      },
      this.callEpochs.get(callId) ?? null
    );
  }

  annotate(callId: string, kind: string, value: unknown, source?: string): void {
    this.write(
      "annotate",
      () =>
        this.records.annotate({
          callId,
          kind,
          value,
          ...(source ? { source } : {}),
        }),
      this.callEpochs.get(callId) ?? null
    );
  }

  record(
    record: Parameters<CallStoreLike["record"]>[0],
    blobs: ReadonlyMap<string, string>,
    events?: string
  ): void {
    const epoch = this.callEpochs.get(record.call_id) ?? this.epoch;
    epoch?.active.delete(record.call_id);
    this.latestProgress.delete(record.call_id);
    const exchanges = this.modelTurns.get(record.call_id);
    if (exchanges) record = { ...record, model_turns: exchanges } as typeof record;
    const programRoot = record.program_root ?? this.programRoots.get(record.task_id) ?? null;
    if (programRoot !== record.program_root) record = { ...record, program_root: programRoot };
    const run = epoch?.run ?? this.run;
    const summary = run && record.parent_call_id === null ? summarize(record, events) : undefined;
    if (summary) run!.calls.push(summary);
    const pending = {
      kind: "record",
      record,
      blobs: Object.fromEntries(blobs),
      ...(events === undefined ? {} : { events }),
    };
    epoch?.pendingStates.set(record.call_id, pending);
    this.write(
      "record",
      async () => {
        const { recordId } = await this.records.record({
          owner: this.owner,
          ...(run ? { runId: run.runId } : {}),
          record: record as unknown as CallRecordJson,
          blobs: Object.fromEntries(blobs),
          ...(events === undefined ? {} : { events }),
        });
        if (summary) summary.recordId = recordId;
        if (this.modelTurns.get(record.call_id) === exchanges)
          this.modelTurns.delete(record.call_id);
        if (epoch?.pendingStates.get(record.call_id) === pending)
          epoch.pendingStates.delete(record.call_id);
        if (!this.modelTurns.has(record.call_id) && !epoch?.pendingStates.has(record.call_id))
          this.callEpochs.delete(record.call_id);
      },
      epoch
    );
  }

  private write(
    what: string,
    operation: () => Promise<unknown>,
    epoch: CaptureEpoch | null | undefined = this.epoch
  ): void {
    this.queue = this.queue.then(operation).then(
      () => undefined,
      (error) => this.captureError(epoch ?? null, `natlang records: ${what} failed`, error)
    );
  }

  /** Report a recording failure once per distinct message; recording never fails the call. */
  fail(prefix: string, error: unknown): void {
    const message = `${prefix}: ${error instanceof Error ? error.message : String(error)}`;
    if (this.reported.has(message)) return;
    this.reported.add(message);
    this.report(message);
  }
}

/** The events of a recorded call (ndjson, or one JSON array). */
export function parseEvents(text: string): Record<string, unknown>[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) return JSON.parse(trimmed) as Record<string, unknown>[];
  return trimmed.split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
}

/**
 * The decision readout of a finite-result call, from its trace: natlang scores the result's values (`decision_readout`
 * phase `scored`), or, when the model cannot score them (a hosted fallback without log-probabilities), says so
 * (`unavailable`) and runs the ordinary tool loop.
 */
export function decisionOf(
  events: readonly Record<string, unknown>[]
): EvalNatlangCallSummary["decision"] {
  const readout = [...events].reverse().find((event) => event["kind"] === "decision_readout");
  if (!readout) return undefined;
  if (readout["phase"] === "unavailable")
    return { mode: "tool-loop", reason: String(readout["reason"] ?? "") };
  const options = readout["options"] as string[] | undefined;
  const probabilities = readout["probabilities"] as number[] | undefined;
  const chosen = readout["chosen"] as number | undefined;
  if (readout["phase"] !== "scored" || !options || !probabilities || chosen === undefined)
    return undefined;
  const ranked = probabilities.map((p, index) => ({ p, index })).sort((a, b) => b.p - a.p);
  const runnerUp = ranked.find((entry) => entry.index !== chosen);
  return {
    mode: "scored",
    value: options[chosen]!,
    p: probabilities[chosen]!,
    ...(runnerUp ? { runnerUp: options[runnerUp.index]!, pRunnerUp: runnerUp.p } : {}),
  };
}

function summarize(
  record: Parameters<CallStoreLike["record"]>[0],
  events: string | undefined
): EvalNatlangCallSummary {
  const detail = record.detail.trim();
  let decision: EvalNatlangCallSummary["decision"];
  if (record.definition.readout === "decision" && events) {
    try {
      decision = decisionOf(parseEvents(events));
    } catch {
      // An unreadable trace leaves the summary without its readout; the record keeps the events.
    }
  }
  return {
    callId: record.call_id,
    name: record.definition.name,
    outcome: record.outcome,
    ...(detail
      ? {
          detail:
            detail.length > SUMMARY_DETAIL_CHARS
              ? `${detail.slice(0, SUMMARY_DETAIL_CHARS)}...`
              : detail,
        }
      : {}),
    ...(record.executor.model_id ? { model: record.executor.model_id } : {}),
    turns: record.cost.turns,
    promptTokens: record.cost.tokens_in,
    completionTokens: record.cost.tokens_out,
    durationMs: record.cost.wall_ms,
    ...(decision ? { decision } : {}),
  };
}

/**
 * Live events of a running task, published to the records service in batches.
 * A model delta is a few characters of a streaming reply, so consecutive deltas
 * of one call turn that continue the same kind of text are joined and sent when
 * they reach a size, or when any other event (which is sent at once, after the
 * text before it) or the end of the run arrives. No timer decides when text leaves.
 */
export class LivePublisher {
  private batch: LiveEventJson[] = [];
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly records: NatlangRecordsClient,
    private readonly owner: NatlangOwner,
    private readonly runId: string,
    private readonly fail: (prefix: string, error: unknown) => void
  ) {}

  readonly sink = (event: LiveEvent): void => {
    const last = this.batch.at(-1);
    if (event.type === "model_delta") {
      if (last?.type === "model_delta" && continues(last, event)) {
        (last["delta"] as { text: string }).text += (event.delta as { text: string }).text;
      } else {
        this.batch.push(structuredClone(event) as unknown as LiveEventJson);
      }
      if (this.batchedTextChars() >= LIVE_TEXT_BATCH_CHARS) this.send();
      return;
    }
    this.batch.push(structuredClone(event) as unknown as LiveEventJson);
    this.send();
  };

  /** Send what is batched and wait until everything sent has been delivered (the run keeps publishing afterwards). */
  async drain(): Promise<void> {
    this.send();
    await this.queue;
  }

  private batchedTextChars(): number {
    let chars = 0;
    for (const event of this.batch) {
      const text = (event["delta"] as { text?: unknown } | undefined)?.text;
      if (typeof text === "string") chars += text.length;
    }
    return chars;
  }

  private send(): void {
    const events = this.batch;
    if (events.length === 0) return;
    this.batch = [];
    this.queue = this.queue
      .then(() =>
        this.records.publishLive({
          owner: this.owner,
          runId: this.runId,
          events,
        })
      )
      .then(
        () => undefined,
        (error) => this.fail("natlang records: live publish failed", error)
      );
  }
}

/** Text deltas of one call turn that can be joined into one delta. */
function continues(batched: LiveEventJson, event: LiveEvent & { type: "model_delta" }): boolean {
  const delta = batched["delta"] as { type?: string; text?: unknown } | undefined;
  return (
    batched.callId === event.callId &&
    batched["turn"] === event.turn &&
    (event.delta.type === "text" || event.delta.type === "reasoning") &&
    delta?.type === event.delta.type &&
    typeof delta.text === "string"
  );
}
