import type { CallDetail, CallSummary, NatlangListCallsFilter } from "@workspace/natlang-records/contract";
import { callFailureReason } from "../vendor/workerd/natlang-workerd.js";
import { lastScope, preview, type NatlangCallFailureReason } from "./callFailure.js";
import { decisionOf } from "./recordsStore.js";

/** Longest text a digest shows of one reply, eval, result or input. */
const SAID_CHARS = 300;
const CODE_CHARS = 600;
const RESULT_CHARS = 400;
const INPUT_CHARS = 400;
/** Most child calls a digest lists; `natlang.calls({ parentCallId })` pages through more. */
const CHILDREN_LISTED = 50;

/** The annotation kind under which the provider records why a call failed. */
export const FAILURE_ANNOTATION = "failure";

/** One action of a turn: the tool, what it was given (eval code), how it went and what came back. */
export interface DigestAction {
  tool: string;
  code?: string;
  arguments?: string;
  outcome: string;
  result: string;
}

/** What natlang.trace(callId) returns: one call, readable without knowing natlang's trace schema. */
export interface NatlangTraceDigest {
  callId: string;
  name: string;
  parentCallId: string | null;
  model: string | null;
  outcome: string;
  /** Why it failed (absent for a call that returned). */
  reason?: NatlangCallFailureReason;
  detail: string;
  /** The arguments it was called with, as bounded previews. */
  inputs: Record<string, string>;
  /** Each model turn: what the model said, and the actions it took with their results. */
  turns: Array<{ turn: number; said?: string; actions: DigestAction[] }>;
  /** The calls it made, oldest first (each one's own digest is `natlang.trace(child.callId)`). */
  children: Array<{ callId: string; name: string; outcome: string; model: string | null }>;
  /** The scope at its last recorded state: `let` bindings and a staged result, as bounded previews. */
  lastScope?: { scope: Record<string, string>; staged?: string };
  /** A finite-result call's decision readout. */
  decision?: ReturnType<typeof decisionOf>;
  /** What it returned. */
  result?: string;
}

/** One call as `natlang.calls(...)` lists it. */
export interface NatlangCallListing {
  callId: string;
  parentCallId: string | null;
  name: string;
  outcome: string;
  model: string | null;
  startedAt: string;
  wallMs: number | null;
  tokens: { in: number | null; out: number | null };
  runId: string | null;
}

/** What `natlang.calls(...)` takes: the records service's call filter, by the names an eval cell uses. */
export interface NatlangCallsQuery {
  /** List the calls this call made. */
  parentCallId?: string;
  /** Only the calls of this eval run. */
  run?: string;
  /** Only root calls (a cell's own calls, not the calls they made). */
  roots?: boolean;
  outcome?: string;
  /** A definition's id, name or source. */
  name?: string;
  since?: string;
  limit?: number;
  /** Continue after this call id of an earlier page. */
  after?: string;
}

export function callsFilter(query: NatlangCallsQuery, ownerKey: string): NatlangListCallsFilter {
  const known = new Set(["parentCallId", "run", "roots", "outcome", "name", "since", "limit", "after"]);
  const unknown = Object.keys(query).filter((key) => !known.has(key));
  if (unknown.length > 0)
    throw new TypeError(
      `natlang.calls takes ${[...known].join(", ")}; not ${unknown.join(", ")}`
    );
  if (query.parentCallId !== undefined && query.roots)
    throw new TypeError("natlang.calls: parentCallId lists children, roots lists root calls; pass one");
  return {
    ownerKey,
    ...(query.parentCallId !== undefined ? { parentCallId: query.parentCallId } : {}),
    ...(query.roots ? { parentCallId: null } : {}),
    ...(query.run !== undefined ? { runId: query.run } : {}),
    ...(query.outcome !== undefined ? { outcome: query.outcome } : {}),
    ...(query.name !== undefined ? { definition: query.name } : {}),
    ...(query.since !== undefined ? { since: query.since } : {}),
    ...(query.limit !== undefined ? { limit: query.limit } : {}),
    ...(query.after !== undefined ? { after: query.after } : {}),
  };
}

export function listing(call: CallSummary): NatlangCallListing {
  return {
    callId: call.call_id,
    parentCallId: call.parent_call_id,
    name: call.definition_name,
    outcome: call.outcome,
    model: call.model_id,
    startedAt: call.started_at,
    wallMs: call.wall_ms,
    tokens: { in: call.tokens_in, out: call.tokens_out },
    runId: call.run_id,
  };
}

const bounded = (text: string, limit: number) => (text.length > limit ? `${text.slice(0, limit)}...` : text);

/** Each model turn of a trace with the actions that followed it. */
function turnsOf(events: readonly Record<string, unknown>[]): NatlangTraceDigest["turns"] {
  const turns: NatlangTraceDigest["turns"] = [];
  for (const event of events) {
    if (event["kind"] === "proposal" && event["phase"] === "generated") {
      const said = String(event["text"] ?? "").trim();
      turns.push({ turn: Number(event["turn"] ?? turns.length + 1), ...(said ? { said: bounded(said, SAID_CHARS) } : {}), actions: [] });
    } else if (event["kind"] === "decision_readout" && event["phase"] === "scored") {
      turns.push({ turn: turns.length + 1, said: "(decision readout: scored the result's values)", actions: [] });
    } else if (event["kind"] === "action") {
      const args = (event["arguments"] ?? {}) as Record<string, unknown>;
      const { code, ...rest } = args;
      const action: DigestAction = {
        tool: String(event["name"]),
        ...(typeof code === "string" ? { code: bounded(code, CODE_CHARS) } : {}),
        ...(Object.keys(rest).length > 0 ? { arguments: preview(rest, RESULT_CHARS) } : {}),
        outcome: String(event["outcome"]),
        result: bounded(String(event["result_text"] ?? ""), RESULT_CHARS),
      };
      // An action before any generated turn (a runtime-prefilled scope eval) opens a turn 0 of its own.
      if (turns.length === 0) turns.push({ turn: 0, actions: [] });
      turns.at(-1)!.actions.push(action);
    }
  }
  return turns;
}

/** The reason a recorded call failed: the provider's annotation, else what natlang's own trace says. */
function reasonOf(detail: CallDetail, events: readonly Record<string, unknown>[]): NatlangCallFailureReason | undefined {
  const outcome = detail.record?.outcome ?? detail.summary.outcome;
  if (outcome === "done" || outcome === "running") return undefined;
  const annotated = [...detail.annotations].reverse().find((annotation) => annotation.kind === FAILURE_ANNOTATION)
    ?.value as
    | { reason?: NatlangCallFailureReason }
    | undefined;
  return annotated?.reason ?? callFailureReason(events);
}

/**
 * A recorded call made readable: its turns (what the model said, each action with its code and result), the calls it
 * made, the scope it ended with, and why it ended. `inputs` and `result` are bounded previews of the recorded values.
 */
export async function traceDigest(options: {
  detail: CallDetail;
  events: readonly Record<string, unknown>[];
  children: readonly CallSummary[];
  /** A recorded value's JSON text by its hash (null when the store does not have it). */
  value: (hash: string) => Promise<string | null>;
}): Promise<NatlangTraceDigest> {
  const { detail, events, children, value } = options;
  const record = detail.record;
  const shown = async (ref: unknown): Promise<string> => {
    const valueRef = ref as { complete?: boolean; hash?: string; preview?: string; reason?: string; type?: string } | null;
    if (!valueRef) return "null";
    if (valueRef.complete && valueRef.hash) {
      const text = await value(valueRef.hash);
      if (text !== null) return bounded(text, INPUT_CHARS);
    }
    return valueRef.preview ? bounded(valueRef.preview, INPUT_CHARS) : `(not recorded: ${valueRef.reason ?? "unknown"})`;
  };
  const inputs = Object.fromEntries(
    await Promise.all(
      Object.entries((record?.["inputs"] ?? {}) as Record<string, unknown>).map(
        async ([name, ref]) => [name, await shown(ref)] as const
      )
    )
  );
  const outcome = record?.outcome ?? detail.summary.outcome;
  const reason = reasonOf(detail, events);
  const scope = lastScope(events);
  const decision = decisionOf(events);
  return {
    callId: detail.summary.call_id,
    name: detail.summary.definition_name,
    parentCallId: detail.summary.parent_call_id,
    model: detail.summary.model_id,
    outcome,
    ...(reason ? { reason } : {}),
    detail: String(record?.["detail"] ?? ""),
    inputs,
    turns: turnsOf(events),
    children: children.slice(0, CHILDREN_LISTED).map((child) => ({
      callId: child.call_id,
      name: child.definition_name,
      outcome: child.outcome,
      model: child.model_id,
    })),
    ...(scope ? { lastScope: scope } : {}),
    ...(decision ? { decision } : {}),
    ...(outcome === "done" && record?.["output"] ? { result: await shown(record["output"]) } : {}),
  };
}

export { CHILDREN_LISTED };
