import { isTerminalAuthorityFailure } from "@vibestudio/rpc";
import type { EvalNatlangCallSummary } from "@vibestudio/service-schemas/eval";
import { NatlangCallError, type NatlangFailureReason } from "../vendor/workerd/natlang-workerd.js";
import { NatlangModelUnavailableError } from "./models.js";

/** The `errorData.protocol` of a failed natlang call. */
export const NATLANG_CALL_FAILURE_PROTOCOL = "natlang-call-failure/1";
/** The eval failure code of a cell that a failed natlang call ended. */
export const NATLANG_CALL_FAILED_CODE = "natlang_call_failed";

/**
 * Why a natlang call failed: natlang's own reasons, with the error that is not the model's outcome (`error`) told
 * apart where Vibestudio knows its cause.
 */
export type NatlangCallFailureReason =
  | Exclude<NatlangFailureReason, "error">
  | "executor-unavailable"
  | "model-unavailable"
  | "model-refused"
  | "error";

/** What to do next, by reason: one sentence, model-facing (EVAL.md "When a natlang call fails" says the same). */
export const NATLANG_FAILURE_NEXT: Readonly<Record<NatlangCallFailureReason, string>> = {
  blocked:
    "The model says the inputs do not support an answer: check what you passed (the trace's inputs) and pass the missing evidence as an argument.",
  failed:
    "The model says the instructions cannot be carried out on these inputs: check the arguments and the instructions, or do this step yourself.",
  "type-mismatch":
    "The model could not produce the declared type: narrow the type or the instructions, retry with .on({ model: \"standard\" }), or do it yourself.",
  "repeated-failed-action":
    "The model kept repeating a failing action: read the trace's last turn, then split the work, retry with .on({ model: \"standard\" }), or do it yourself.",
  "no-action":
    "The model kept replying without acting: make the instructions say exactly what to return, retry with .on({ model: \"standard\" }), or do it yourself.",
  "budget-exhausted":
    "The call used its whole turn and token budget: do the exact parts in code and give the model one decision, or give a program function a budget: frontmatter.",
  refinement:
    "The result did not satisfy its refined type: read the detail, then tighten the instructions or loosen the predicate.",
  refused:
    "Natlang did not run this call (a nesting limit, or a call asking its caller's own question): solve this part in the calling code.",
  incomplete:
    "The call ended without a result: read the trace's last turn and the detail.",
  cancelled: "The run was cancelled: nothing to recover.",
  "executor-unavailable":
    "No model fills the executor role: see the local-models skill to make the local model ready, connect a low-tier provider, or do this work yourself.",
  "model-unavailable":
    "The model this call names is unknown or not connected: name a connected model (a role, or a provider:id ref), or connect its provider.",
  "model-refused":
    "The model gateway refused this call (authority or usage): it is final for this call; report it and do not retry in a loop.",
  error:
    "An error that is not the model's outcome ended the call (see cause): fix what it names; the trace shows what had run.",
};

/** Longest `detail` a failure record keeps (the full text is in the call's record). */
const DETAIL_CHARS = 2000;
/** Longest preview of one scope value in a failure record's `partial`. */
const PREVIEW_CHARS = 400;
/** Most scope bindings a failure record's `partial` keeps. */
const PARTIAL_BINDINGS = 24;

/** The `errorData` of a failed natlang call: what failed, why, and where its trace is. */
export interface NatlangCallFailureRecord {
  protocol: typeof NATLANG_CALL_FAILURE_PROTOCOL;
  code: typeof NATLANG_CALL_FAILED_CODE;
  /**
   * The call, and its record: `natlang.trace(callId)`, `natlang.rerun(callId, { model })`. Absent for a call natlang
   * refused before it started (`refused`), which has no record.
   */
  callId?: string;
  name: string;
  reason: NatlangCallFailureReason;
  /** Natlang's outcome: `quiesced` (the model's work ended without a result) or `failed`. */
  outcome: string;
  detail: string;
  model?: string;
  turns?: number;
  /** The expression that reads the call's trace digest (with `callId`). */
  trace?: string;
  next: string;
  /**
   * What the call had when it ended (bounded previews of its scope's `let` bindings, and a result it had staged):
   * the partial work to take over when you do the job yourself.
   */
  partial?: { scope: Record<string, string>; staged?: string };
  /** The error that ended the call when it is not the model's outcome. */
  cause?: { name?: string; message: string; code?: string; errorKind?: string };
}

/**
 * A failed natlang call as an eval cell sees it. `name` is `NatlangCallError`, the name natlang's own failures have;
 * the record's fields are on the error itself too (`callId`, `reason`, `outcome`, `detail`, `trace`, `partial`) and,
 * as `errorData`, survive the eval boundary into the eval result.
 */
export class NatlangCallFailure extends Error {
  override readonly name = "NatlangCallError";
  readonly errorData: NatlangCallFailureRecord;
  readonly callId: string | undefined;
  readonly reason: NatlangCallFailureReason;
  readonly outcome: string;
  readonly detail: string;
  readonly trace: string | undefined;
  readonly partial: NatlangCallFailureRecord["partial"];

  constructor(record: NatlangCallFailureRecord) {
    super(
      `natlang ${record.name}: ${record.outcome}: ${record.detail}` +
        (record.callId ? ` (record ${record.callId})` : "")
    );
    this.errorData = record;
    this.callId = record.callId;
    this.reason = record.reason;
    this.outcome = record.outcome;
    this.detail = record.detail;
    this.trace = record.trace;
    this.partial = record.partial;
    // The frames of this error are the provider's, never the cell's: the message is all there is to show.
    this.stack = `${this.name}: ${this.message}`;
  }
}

const bounded = (text: string, limit: number) => (text.length > limit ? `${text.slice(0, limit)}...` : text);

/** A bounded, readable preview of a trace value (natlang's diagnostic values are JSON already). */
export function preview(value: unknown, limit = PREVIEW_CHARS): string {
  let text: string;
  try {
    text = typeof value === "string" ? value : (JSON.stringify(value) ?? String(value));
  } catch {
    text = String(value);
  }
  return bounded(text, limit);
}

/** The scope a call had at its last recorded state: its `let` bindings and any staged result. */
export function lastScope(
  events: readonly Record<string, unknown>[]
): NatlangCallFailureRecord["partial"] | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!;
    if (event["kind"] !== "state") continue;
    const lambda = (event["value"] as { $lambda?: { let?: Record<string, unknown>; return?: unknown } } | undefined)
      ?.$lambda;
    if (!lambda) continue;
    const scope = Object.fromEntries(
      Object.entries(lambda.let ?? {})
        .slice(0, PARTIAL_BINDINGS)
        .map(([name, value]) => [name, preview(value)])
    );
    if (Object.keys(scope).length === 0 && lambda.return === undefined) return undefined;
    return { scope, ...(lambda.return === undefined ? {} : { staged: preview(lambda.return) }) };
  }
  return undefined;
}

/** The reason of a natlang failure, with the error that ended it classified where Vibestudio knows its cause. */
function reasonOf(error: NatlangCallError): NatlangCallFailureReason {
  if (error.reason !== "error") return error.reason;
  const cause = error.cause;
  if (cause instanceof NatlangModelUnavailableError)
    return cause.role ? "executor-unavailable" : "model-unavailable";
  if (
    isTerminalAuthorityFailure(cause) ||
    (cause as { errorKind?: unknown } | null)?.errorKind === "access"
  )
    return "model-refused";
  return "error";
}

function causeOf(error: NatlangCallError): NatlangCallFailureRecord["cause"] | undefined {
  const cause = error.cause as
    | { name?: unknown; message?: unknown; code?: unknown; errorKind?: unknown }
    | null
    | undefined;
  if (cause === undefined || cause === null) return undefined;
  return {
    ...(typeof cause.name === "string" ? { name: cause.name } : {}),
    message: bounded(typeof cause.message === "string" ? cause.message : String(cause), DETAIL_CHARS),
    ...(typeof cause.code === "string" ? { code: cause.code } : {}),
    ...(typeof cause.errorKind === "string" ? { errorKind: cause.errorKind } : {}),
  };
}

/**
 * The failure a cell sees for a natlang call that ended without a result: natlang's `NatlangCallError` made into
 * one typed record (its summary, when the cell's run has it, gives the model and turns, and learns the reason).
 * Anything else is not a natlang call failure and is returned as it is.
 */
export function callFailure(error: unknown, calls: readonly EvalNatlangCallSummary[] | undefined): unknown {
  if (!(error instanceof NatlangCallError)) return error;
  const reason = reasonOf(error);
  const callId = error.callId || undefined;
  const summary = callId ? calls?.find((call) => call.callId === callId) : undefined;
  if (summary) summary.reason = reason;
  const partial = lastScope(error.trace);
  const cause = reason === "error" || reason === "model-refused" ? causeOf(error) : undefined;
  return new NatlangCallFailure({
    protocol: NATLANG_CALL_FAILURE_PROTOCOL,
    code: NATLANG_CALL_FAILED_CODE,
    ...(callId ? { callId } : {}),
    name: error.definition,
    reason,
    outcome: error.outcome,
    detail: bounded(error.detail.trim(), DETAIL_CHARS),
    ...(summary?.model ? { model: summary.model } : {}),
    ...(summary ? { turns: summary.turns } : {}),
    ...(callId ? { trace: `await natlang.trace(${JSON.stringify(callId)})` } : {}),
    next: NATLANG_FAILURE_NEXT[reason],
    ...(partial ? { partial } : {}),
    ...(cause ? { cause } : {}),
  });
}
