import { createReceiverRpcMethods } from "@vibestudio/shared/rpcMethods";
import { z } from "zod";

/** Service protocol implemented by the Base natlang records worker. */
export const NATLANG_RECORDS_SERVICE_PROTOCOL = "vibestudio.natlang.v1";

/** Largest page `listCalls` returns; `limit` above it is rejected. */
export const NATLANG_LIST_LIMIT_MAX = 500;
export const NATLANG_LIST_LIMIT_DEFAULT = 100;

// ── Owners ──────────────────────────────────────────────────────────────────

/** Who ran a natlang call: the owner whose eval, panel or headless program started it. */
export const natlangOwnerSchema = z
  .object({
    kind: z.enum(["agent", "panel", "headless", "user"]),
    objectKey: z.string().min(1),
    agentRef: z.string().min(1).optional(),
    channelId: z.string().min(1).optional(),
  })
  .strict();
export type NatlangOwner = z.infer<typeof natlangOwnerSchema>;

// ── Call records ────────────────────────────────────────────────────────────

/**
 * A natlang call record (`natlang.calls/1`) as an opaque JSON document. Only the
 * fields the service indexes are typed; everything else is carried verbatim and
 * stays `unknown` here, so this contract never depends on natlang itself.
 */
export interface CallRecordJson {
  version: string;
  call_id: string;
  parent_call_id: string | null;
  parent_action_index: number | null;
  task_id: string;
  program_id: string | null;
  program_root: string | null;
  run_label?: string;
  definition: {
    id: string;
    name: string;
    source: string | null;
    key: string;
    interface: string;
    site: string;
    [field: string]: unknown;
  };
  executor: { kind: string; model_id: string | null; [field: string]: unknown };
  /** Recorded inputs by parameter name: `ValueRef`s naming blobs by hash. */
  inputs: Record<string, unknown>;
  /** A `ValueRef`, or null. */
  output: unknown;
  outcome: string;
  detail: string;
  started_at: string;
  ended_at: string;
  cost: {
    model_requests: number;
    tokens_in: number;
    tokens_out: number;
    wall_ms: number;
    [field: string]: unknown;
  };
  approach: { hash: string | null; [field: string]: unknown };
  audit_of?: string | null;
  /** A `ValueRef` to the event stream, or null; the service sets it when `events` is supplied. */
  events: unknown;
  [field: string]: unknown;
}

const callRecordSchema = z
  .object({
    version: z.string(),
    call_id: z.string().min(1),
    parent_call_id: z.string().nullable(),
    parent_action_index: z.number().int().nullable(),
    task_id: z.string(),
    program_id: z.string().nullable(),
    program_root: z.string().nullable(),
    run_label: z.string().optional(),
    definition: z
      .object({
        id: z.string(),
        name: z.string(),
        source: z.string().nullable(),
        key: z.string(),
        interface: z.string(),
        site: z.string(),
      })
      .passthrough(),
    executor: z
      .object({ kind: z.string(), model_id: z.string().nullable() })
      .passthrough(),
    inputs: z.record(z.unknown()),
    output: z.unknown(),
    outcome: z.string(),
    detail: z.string(),
    started_at: z.string(),
    ended_at: z.string(),
    cost: z
      .object({
        model_requests: z.number(),
        tokens_in: z.number(),
        tokens_out: z.number(),
        wall_ms: z.number(),
      })
      .passthrough(),
    approach: z.object({ hash: z.string().nullable() }).passthrough(),
    audit_of: z.string().nullable().optional(),
    events: z.unknown(),
  })
  .passthrough();

/** One call as listings show it (snake_case, like the record it projects). */
export interface CallSummary {
  call_id: string;
  parent_call_id: string | null;
  definition_id: string;
  definition_name: string;
  definition_key: string;
  definition_source: string | null;
  executor: string;
  model_id: string | null;
  /** `running` until the call is recorded. */
  outcome: string;
  started_at: string;
  wall_ms: number | null;
  tokens_in: number | null;
  tokens_out: number | null;
  approach_hash: string | null;
  program_root: string | null;
  audit_of: string | null;
  run_label: string | null;
  owner_kind: NatlangOwner["kind"];
  owner_key: string;
  agent_ref: string | null;
  channel_id: string | null;
  run_id: string | null;
}

export interface Annotation {
  kind: string;
  value: unknown;
  source: string | null;
  created_at: string;
}

/** A root program call's input and expected result: one line of a program's `tune.examples.jsonl`. */
export interface TuneExample {
  /** The program source file (`definition.source`). */
  function: string;
  input: Record<string, unknown>;
  expected?: unknown;
  group: string;
  /** The model that produced a `good` output, or `tester` for a given expected result. */
  producer: string;
  protected?: true;
  [field: string]: unknown;
}

export interface CallDetail {
  /** Null while the call is still running (or was interrupted before it was recorded). */
  record: CallRecordJson | null;
  summary: CallSummary;
  /** The latest event stream (ndjson), or null when there is none or it was evicted. */
  events: string | null;
  annotations: Annotation[];
}

// ── Live events ─────────────────────────────────────────────────────────────

/**
 * One of natlang's `LiveEvent`s: `type` and the call it belongs to are typed;
 * the rest of the payload is opaque to the service, which only forwards it.
 */
export interface LiveEventJson {
  type: string;
  callId: string;
  taskId?: string;
  parentCallId?: string | null;
  definitionId?: string;
  name?: string;
  [field: string]: unknown;
}

const liveEventSchema = z
  .object({ type: z.string().min(1), callId: z.string().min(1) })
  .passthrough();

/** Which published events a live subscriber receives: every field given must match. */
export const natlangLiveFilterSchema = z
  .object({
    runId: z.string().min(1).optional(),
    agentRef: z.string().min(1).optional(),
    channelId: z.string().min(1).optional(),
  })
  .strict();
export type NatlangLiveFilter = z.infer<typeof natlangLiveFilterSchema>;

/** The payload of one record of a live subscription stream. */
export interface NatlangLiveDelivery {
  owner: NatlangOwner;
  runId?: string;
  events: LiveEventJson[];
}

/** First record of a live subscription stream. */
export interface NatlangLiveSubscribed {
  subscriptionId: string;
}

// ── Inputs ──────────────────────────────────────────────────────────────────

const idSchema = z.string().min(1).max(512);
const definitionIdentitySchema = z.object({
  id: z.string(),
  name: z.string(),
  source: z.string().nullable(),
  key: z.string(),
  interface: z.string(),
  site: z.string(),
});

/** Shape of the running row `begin` writes. */
export const natlangBeginInputSchema = z
  .object({
    owner: natlangOwnerSchema,
    runId: idSchema.optional(),
    callId: idSchema,
    parentCallId: idSchema.nullable(),
    parentActionIndex: z.number().int().nullable(),
    taskId: z.string(),
    programId: z.string().nullable(),
    programRoot: z.string().nullable(),
    definition: definitionIdentitySchema,
    modelId: z.string().nullable(),
    startedAt: z.string(),
    auditOf: idSchema.nullable(),
    runLabel: z.string().optional(),
  })
  .strict();
export type NatlangBeginInput = z.infer<typeof natlangBeginInputSchema>;

export const natlangProgressInputSchema = z
  .object({ callId: idSchema, events: z.string() })
  .strict();
export type NatlangProgressInput = z.infer<typeof natlangProgressInputSchema>;

export const natlangDiscardInputSchema = z.object({ callId: idSchema }).strict();
export type NatlangDiscardInput = z.infer<typeof natlangDiscardInputSchema>;

export const natlangRecordInputSchema = z
  .object({
    owner: natlangOwnerSchema,
    runId: idSchema.optional(),
    record: callRecordSchema,
    /** Text of every complete value the record references, by the SHA-256 hex of the text. */
    blobs: z.record(z.string()),
    /** The call's trace events as ndjson. */
    events: z.string().optional(),
  })
  .strict();
export type NatlangRecordInput = Omit<z.infer<typeof natlangRecordInputSchema>, "record"> & {
  record: CallRecordJson;
};

export interface NatlangRecordResult {
  /** The call ID the record is stored under. */
  recordId: string;
}

export const natlangListCallsFilterSchema = z
  .object({
    runId: z.string().optional(),
    agentRef: z.string().optional(),
    channelId: z.string().optional(),
    /** The owner's `objectKey`. */
    ownerKey: z.string().optional(),
    /** Matches a definition's id, name or source. */
    definition: z.string().optional(),
    outcome: z.string().optional(),
    /** ISO time: calls started at or after it. */
    since: z.string().optional(),
    /** A call ID lists its children; null lists root calls only. */
    parentCallId: idSchema.nullable().optional(),
    /** Include audit runs, which listings hide by default. */
    audits: z.boolean().optional(),
    limit: z.number().int().positive().max(NATLANG_LIST_LIMIT_MAX).optional(),
    /** Continue after this call ID of an earlier page. */
    after: z.string().optional(),
  })
  .strict();
export type NatlangListCallsFilter = z.infer<typeof natlangListCallsFilterSchema>;

export const natlangGetCallInputSchema = z.object({ callId: idSchema }).strict();
export type NatlangGetCallInput = z.infer<typeof natlangGetCallInputSchema>;

export const natlangGetValueInputSchema = z.object({ hash: z.string().min(1) }).strict();
export type NatlangGetValueInput = z.infer<typeof natlangGetValueInputSchema>;

export const natlangAnnotateInputSchema = z
  .object({
    callId: idSchema,
    kind: z.string().min(1),
    value: z.unknown(),
    source: z.string().optional(),
  })
  .strict();
export type NatlangAnnotateInput = z.infer<typeof natlangAnnotateInputSchema>;

export const natlangFeedbackInputSchema = z
  .object({
    callId: idSchema,
    verdict: z.enum(["good", "bad", "fix"]),
    /** The right answer, as JSON. `null` is a valid expected value. */
    expected: z.unknown().optional(),
    group: z.string().min(1).optional(),
  })
  .strict();
export type NatlangFeedbackInput = z.infer<typeof natlangFeedbackInputSchema>;

export interface NatlangFeedbackResult {
  message: string;
  /** The tune example the verdict stored, or null when it stores none. */
  example: TuneExample | null;
}

export const natlangImportExamplesInputSchema = z
  .object({ jsonl: z.string(), program: z.string().min(1) })
  .strict();
export type NatlangImportExamplesInput = z.infer<typeof natlangImportExamplesInputSchema>;

export const natlangTuneExamplesInputSchema = z
  .object({ program: z.string().min(1).optional() })
  .strict();
export type NatlangTuneExamplesInput = z.infer<typeof natlangTuneExamplesInputSchema>;

export interface NatlangTuneExamplesResult {
  /** The stored examples as the text of `tune.examples.jsonl`; empty when there are none. */
  jsonl: string;
  count: number;
}

export const natlangSubscribeLiveInputSchema = natlangLiveFilterSchema;

export const natlangUnsubscribeLiveInputSchema = z
  .object({ subscriptionId: z.string().min(1) })
  .strict();
export type NatlangUnsubscribeLiveInput = z.infer<typeof natlangUnsubscribeLiveInputSchema>;

export const natlangPublishLiveInputSchema = z
  .object({
    owner: natlangOwnerSchema,
    runId: idSchema.optional(),
    events: z.array(liveEventSchema),
  })
  .strict();
export type NatlangPublishLiveInput = Omit<
  z.infer<typeof natlangPublishLiveInputSchema>,
  "events"
> & { events: LiveEventJson[] };

/** What the store holds: calls and evaluations, and the bytes of the values and traces behind them. */
export interface NatlangStoreStats {
  calls: number;
  /** Calls still running (not yet recorded). */
  running: number;
  evaluations: number;
  /** Bytes of stored values, event streams and call records. */
  blobBytes: number;
  /** The size bound; the oldest unpinned data is evicted past it. */
  blobBudgetBytes: number;
}

// ── Evaluation results ──────────────────────────────────────────────────────

/** Largest evaluation record the service accepts, as JSON text. */
export const NATLANG_EVALUATION_MAX_BYTES = 256 * 1024;

/**
 * The summary of one natlang evaluation-suite run (`pnpm natlang:eval`'s `vibestudio.natlang-eval/1` record without its
 * per-case rollouts): what ran, on which executor, how it scored, and whether the suite's gates passed. The service keeps
 * it so the panel can show the latest result per program with its gates; the full result stays with the run's own output.
 */
export const natlangEvaluationSchema = z
  .object({
    template: z.string().min(1),
    suite: z
      .object({
        id: z.string().min(1),
        /** Workspace path of the suite file; its folder is the program. */
        path: z.string().min(1),
        hash: z.string(),
        cases: z.record(z.number()),
      })
      .strict(),
    split: z.enum(["train", "validation", "test"]),
    /** The adaptation artifact the run used, if any. */
    artifact: z.string().nullable(),
    natlang: z.object({ commit: z.string() }).strict(),
    /** The model under test (natlang's executor identity, as run). */
    executorIdentity: z.unknown(),
    summary: z
      .object({
        quality: z.number().nullable(),
        cases: z.number(),
        gatesPassed: z.boolean(),
        modelCalls: z.number(),
        meanLatencyMs: z.number().nullable(),
      })
      .passthrough(),
    cases: z.array(
      z
        .object({
          caseId: z.string(),
          status: z.string(),
          quality: z.number().nullable(),
        })
        .strict()
    ),
    budget: z.unknown(),
  })
  .strict();
export type NatlangEvaluation = z.infer<typeof natlangEvaluationSchema>;

export const natlangRecordEvaluationInputSchema = z
  .object({
    evaluation: natlangEvaluationSchema,
    /** When the run finished (ISO time); the service's clock when absent. */
    ranAt: z.string().optional(),
  })
  .strict();
export type NatlangRecordEvaluationInput = z.infer<typeof natlangRecordEvaluationInputSchema>;

export interface NatlangEvaluationRecord {
  evaluationId: string;
  ranAt: string;
  /** The suite's folder: the program the suite evaluates. */
  program: string;
  evaluation: NatlangEvaluation;
}

export const natlangListEvaluationsInputSchema = z
  .object({
    program: z.string().optional(),
    suiteId: z.string().optional(),
    split: z.enum(["train", "validation", "test"]).optional(),
    /** One record per program, suite and split: the most recent. */
    latest: z.boolean().optional(),
    limit: z.number().int().positive().max(NATLANG_LIST_LIMIT_MAX).optional(),
  })
  .strict();
export type NatlangListEvaluationsInput = z.infer<typeof natlangListEvaluationsInputSchema>;

// ── Receiver contract ───────────────────────────────────────────────────────

export interface NatlangRecordsRpc {
  begin(input: NatlangBeginInput): Promise<void>;
  progress(input: NatlangProgressInput): Promise<void>;
  discard(input: NatlangDiscardInput): Promise<void>;
  record(input: NatlangRecordInput): Promise<NatlangRecordResult>;
  listCalls(filter: NatlangListCallsFilter): Promise<CallSummary[]>;
  getCall(input: NatlangGetCallInput): Promise<CallDetail | null>;
  getValue(input: NatlangGetValueInput): Promise<string | null>;
  annotate(input: NatlangAnnotateInput): Promise<void>;
  feedback(input: NatlangFeedbackInput): Promise<NatlangFeedbackResult>;
  importExamples(input: NatlangImportExamplesInput): Promise<{ added: number; updated: number; unchanged: number }>;
  tuneExamples(input: NatlangTuneExamplesInput): Promise<NatlangTuneExamplesResult>;
  /**
   * The subscription resource is the response body: ndjson records, the first
   * `{kind:"subscribed", result: NatlangLiveSubscribed}`, then one
   * `{kind:"message", payload: NatlangLiveDelivery}` per delivery. Closing or
   * losing the response ends the subscription.
   */
  subscribeLive(filter: NatlangLiveFilter): Promise<Response>;
  unsubscribeLive(input: NatlangUnsubscribeLiveInput): Promise<void>;
  liveInterest(): Promise<{ subscribed: boolean }>;
  publishLive(input: NatlangPublishLiveInput): Promise<{ delivered: number }>;
  stats(): Promise<NatlangStoreStats>;
  recordEvaluation(input: NatlangRecordEvaluationInput): Promise<{ evaluationId: string }>;
  listEvaluations(input: NatlangListEvaluationsInput): Promise<NatlangEvaluationRecord[]>;
}

export const natlangRecordsRpcMethods = createReceiverRpcMethods<NatlangRecordsRpc>([
  "begin",
  "progress",
  "discard",
  "record",
  "listCalls",
  "getCall",
  "getValue",
  "annotate",
  "feedback",
  "importExamples",
  "tuneExamples",
  "subscribeLive",
  "unsubscribeLive",
  "liveInterest",
  "publishLive",
  "stats",
  "recordEvaluation",
  "listEvaluations",
]);
