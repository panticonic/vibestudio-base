import type { CallRecordJson, CallSummary } from "@workspace/natlang-records/contract";
import { DashboardError, type NatlangPanelPorts } from "./ports.js";

type Json = Record<string, any>;

/** The events of a stored call: ndjson, or one JSON array, as an array. */
export function parseEvents(text: string | null): unknown[] {
  if (text === null) return [];
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) return JSON.parse(trimmed) as unknown[];
  return trimmed.split("\n").map((line) => JSON.parse(line) as unknown);
}

interface ValueRef {
  complete?: boolean;
  hash?: string;
}

/**
 * natlang's `expandedRecord`: a record with its values in place of their references. A reference the store no longer
 * holds (evicted) or never held (oversize, nonportable) stays a reference, which the dashboard draws as what it is.
 */
export async function expandRecord(
  record: CallRecordJson,
  getValue: (hash: string) => Promise<string | null>
): Promise<Json> {
  const cache = new Map<string, Promise<unknown>>();
  const value = (ref: unknown): Promise<unknown> => {
    const { complete, hash } = (ref ?? {}) as ValueRef;
    if (!complete || !hash) return Promise.resolve(ref);
    let pending = cache.get(hash);
    if (!pending) {
      pending = getValue(hash).then((text) => (text === null ? ref : (JSON.parse(text) as unknown)));
      cache.set(hash, pending);
    }
    return pending;
  };
  const entries = async (record: Record<string, unknown> | undefined) =>
    Object.fromEntries(
      await Promise.all(
        Object.entries(record ?? {}).map(async ([name, ref]) => [name, await value(ref)] as const)
      )
    );
  const raw = record as Json;
  const [inputs, captures, output, effects, captureWrites, instructions] = await Promise.all([
    entries(raw["inputs"]),
    entries(raw["captures"]),
    value(raw["output"]),
    Promise.all(
      ((raw["effects"] ?? []) as Json[]).map(async (effect) => ({
        ...effect,
        args: await value(effect["args"]),
        result: await value(effect["result"]),
      }))
    ),
    Promise.all(
      ((raw["capture_writes"] ?? []) as Json[]).map(async (write) => ({
        ...write,
        after: await value(write["after"]),
      }))
    ),
    value(raw["definition"]?.["instructions"]),
  ]);
  return {
    ...raw,
    inputs,
    captures,
    output,
    effects,
    capture_writes: captureWrites,
    definition: { ...raw["definition"], instructions },
  };
}

/** Whether `root` (a recorded program root) is the workspace program at `program`. */
export function isProgram(root: string | null, program: string): boolean {
  if (!root) return false;
  const wanted = program.replace(/^\/+|\/+$/g, "");
  const have = root.replace(/^\/+|\/+$/g, "");
  return have === wanted || have.endsWith(`/${wanted}`);
}

interface HotRow {
  definition_name: string;
  definition_source: string | null;
  calls: number;
  crisp_calls: number;
  tokens: number;
  wall_ms: number;
}

/** A listing row: the service's summary, with the model it ran on as its executor. */
function summaryRow(call: CallSummary): Json {
  return { ...call, executor: call.model_id ?? call.executor };
}

export interface TracesFilters {
  definition?: string;
  outcome?: string;
  program?: string;
  executor?: string;
  limit?: number;
}

/**
 * The dashboard's `TracesApi` over the natlang records service: the calls every owner's runs recorded (agent evals,
 * this panel's own runs, headless programs), their inputs and results, traces, and tester feedback.
 */
export function tracesApi(ports: Pick<NatlangPanelPorts, "records" | "fs">) {
  const { records, fs } = ports;
  /** Calls fetched for an aggregate or a client-side filter: the service pages at most this many. */
  const PAGE = 500;

  /** A tune example the service stored belongs in its program's `tune.examples.jsonl`: the service never touches files. */
  async function writeTuneExample(root: string | null): Promise<string | null> {
    if (!root) return null;
    const directory = root.replace(/^\/+/, "").replace(/\/+$/, "");
    if (!directory || directory.split("/").includes("..")) return null;
    let isDirectory = false;
    try {
      isDirectory = (await fs.stat(directory)).isDirectory();
    } catch {
      return null;
    }
    if (!isDirectory) return null;
    const { jsonl } = await records.tuneExamples({ program: root });
    await fs.writeFile(`${directory}/tune.examples.jsonl`, jsonl);
    return `${directory}/tune.examples.jsonl`;
  }

  return {
    async list(filters: TracesFilters = {}): Promise<Json[]> {
      const wanted = filters.limit ?? 100;
      const rows = await records.listCalls({
        ...(filters.definition ? { definition: filters.definition } : {}),
        ...(filters.outcome ? { outcome: filters.outcome } : {}),
        // A program filter is applied here: the service indexes calls by definition, not by workspace program.
        limit: filters.program ? PAGE : Math.min(wanted, PAGE),
      });
      const shown = rows
        .filter((row) => !filters.program || isProgram(row.program_root, filters.program))
        .filter((row) => !filters.executor || (row.model_id ?? row.executor).includes(filters.executor))
        .slice(0, wanted);
      return shown.map(summaryRow);
    },

    async hot(by: "calls" | "tokens" | "wall_ms" = "calls"): Promise<Json[]> {
      const rows = await records.listCalls({ limit: PAGE });
      const groups = new Map<string, HotRow>();
      for (const row of rows) {
        const group = groups.get(row.definition_key) ?? {
          definition_name: row.definition_name,
          definition_source: row.definition_source,
          calls: 0,
          crisp_calls: 0,
          tokens: 0,
          wall_ms: 0,
        };
        group.calls += 1;
        if (row.executor === "crisp") group.crisp_calls += 1;
        group.tokens += (row.tokens_in ?? 0) + (row.tokens_out ?? 0);
        group.wall_ms += row.wall_ms ?? 0;
        groups.set(row.definition_key, group);
      }
      return [...groups.values()].sort((left, right) => right[by] - left[by]).slice(0, 30);
    },

    async get(id: string): Promise<Json> {
      const detail = await records.getCall(id);
      if (!detail) throw new DashboardError(`no call ${id}`, 404);
      const children = (await records.listCalls({ parentCallId: id, limit: PAGE })).map(summaryRow);
      if (!detail.record) {
        return {
          running: {
            call_id: detail.summary.call_id,
            definition_name: detail.summary.definition_name,
            outcome: detail.summary.outcome,
            started_at: detail.summary.started_at,
          },
          children,
          events: parseEvents(detail.events),
        };
      }
      return {
        record: await expandRecord(detail.record, (hash) => records.getValue(hash)),
        annotations: detail.annotations,
        children,
        cases: [],
      };
    },

    async events(id: string): Promise<unknown[]> {
      const detail = await records.getCall(id);
      if (!detail) throw new DashboardError(`no call ${id}`, 404);
      return parseEvents(detail.events);
    },

    async feedback(
      id: string,
      feedback: { verdict: "good" | "bad" | "fix"; expected?: unknown }
    ): Promise<{ message: string }> {
      const result = await records.feedback({
        callId: id,
        verdict: feedback.verdict,
        ...(feedback.expected === undefined ? {} : { expected: feedback.expected }),
      });
      if (!result.example) return { message: result.message };
      const detail = await records.getCall(id);
      const written = await writeTuneExample(detail?.record?.program_root ?? null);
      return { message: written ? `${result.message}; wrote ${written}` : result.message };
    },

    /** Annotating a call keeps it (pinned calls are never evicted); the service has no way to unpin. */
    async pin(id: string, pinned = true): Promise<{ ok: true }> {
      await records.annotate({ callId: id, kind: "pin", value: { pinned }, source: "natlang panel" });
      return { ok: true };
    },

    async compilations(): Promise<Json[]> {
      return [];
    },
  };
}
