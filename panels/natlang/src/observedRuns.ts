import type { CallSummary, NatlangLiveDelivery, LiveEventJson } from "@workspace/natlang-records/contract";
import type { NatlangLiveSubscription, NatlangRecordsClient } from "@workspace/natlang-records/client";
import type { LiveEvent, RunObserver, RunRecord } from "@workspace/natlang/dashboard/types.js";
import { expandRecord, parseEvents } from "./tracesApi.js";

const OBSERVED = "observed:";
/** Root calls the Runs list reads: the service pages at most this many. */
const ROOTS = 100;
const CALLS = 500;

/** A group of calls one eval run (or one headless call) made: what the Runs page shows as one run. */
interface Group {
  key: string;
  runId: string | null;
  roots: CallSummary[];
}

const isRoot = (event: { parentCallId?: unknown }) => event.parentCallId === null || event.parentCallId === undefined;

/** The label a run is listed under: who ran it and what it called. `/` would read as a path to the page. */
function label(group: Group): string {
  const first = group.roots[0]!;
  const who = first.agent_ref ?? first.owner_kind;
  const names = [...new Set(group.roots.map((call) => call.definition_name))];
  return `${who} · ${names.slice(0, 2).join(", ")}${names.length > 2 ? ` +${names.length - 2}` : ""}`.replaceAll("/", "∕");
}

function statusOf(roots: readonly Pick<CallSummary, "outcome">[]): RunRecord["status"] {
  if (roots.some((call) => call.outcome === "running")) return "running";
  if (roots.some((call) => call.outcome === "failed" || call.outcome === "blocked")) return "failed";
  if (roots.some((call) => call.outcome === "interrupted")) return "lost";
  if (roots.every((call) => call.outcome === "quiesced")) return "stopped";
  return "done";
}

/** The workspace path of the function a call ran, when it is one of a workspace program's `.nl` files. */
function functionPath(call: CallSummary): string | null {
  if (!call.program_root || !call.definition_source?.endsWith(".nl")) return null;
  return `${call.program_root.replace(/^\/+|\/+$/g, "")}/${call.definition_source}`;
}

/**
 * A group as a run record. As for a run this panel started, `meta` names what "Run again" needs: the function's path,
 * its program and, once a watcher has read the record, the inputs of its first call. A run with no such function (an
 * inline call) is named by who ran it and what it called, and cannot be run again.
 */
function toRecord(unsorted: Group, inputs?: Record<string, unknown>): RunRecord {
  const roots = [...unsorted.roots].sort((a, b) => (a.started_at < b.started_at ? -1 : 1));
  const group = { ...unsorted, roots };
  const status = statusOf(roots);
  const first = roots[0]!;
  const end = roots.reduce((latest, call) => Math.max(latest, Date.parse(call.started_at) + (call.wall_ms ?? 0)), 0);
  const path = functionPath(first);
  return {
    id: `${OBSERVED}${group.key}`,
    kind: "call",
    title: label(group),
    status,
    exitCode: status === "done" ? 0 : status === "running" ? null : 1,
    startedAt: first.started_at,
    endedAt: status === "running" ? null : new Date(end).toISOString(),
    interactive: false,
    meta: {
      path: path ?? label(group),
      ...(path ? { program: first.program_root!.replace(/^\/+|\/+$/g, ""), inputs: inputs ?? {} } : {}),
      observed: { owner: first.owner_kind, agent: first.agent_ref, channel: first.channel_id, runId: group.runId, label: label(group) },
    },
  };
}

/** The calls of every owner other than this panel's runs, grouped by the eval run that made them. */
export class ObservedRuns {
  private readonly hidden = new Set<string>();
  /** Root calls the live feed has seen start or end, until the records service lists them. */
  private readonly live = new Map<string, CallSummary>();
  private feed: NatlangLiveSubscription | null = null;
  private listeners = 0;

  constructor(
    private readonly deps: {
      records: NatlangRecordsClient;
      /** Whether a run is one this panel started (it lists those itself). */
      isOwn(runId: string): boolean;
      changed(): void;
      failed(error: Error): void;
    }
  ) {}

  private groups(rows: readonly CallSummary[]): Group[] {
    const merged = new Map(rows.map((row) => [row.call_id, row] as const));
    for (const [callId, row] of this.live) {
      const stored = merged.get(callId);
      // The record is the truth once it exists; before that the live events are.
      if (!stored || stored.outcome === "running") merged.set(callId, row);
    }
    const groups = new Map<string, Group>();
    for (const row of merged.values()) {
      if (row.parent_call_id !== null || (row.run_id && this.deps.isOwn(row.run_id))) continue;
      const key = row.run_id ?? `call:${row.call_id}`;
      if (this.hidden.has(key)) continue;
      const group = groups.get(key) ?? { key, runId: row.run_id, roots: [] };
      group.roots.push(row);
      groups.set(key, group);
    }
    return [...groups.values()];
  }

  async list(): Promise<RunRecord[]> {
    const rows = await this.deps.records.listCalls({ parentCallId: null, limit: ROOTS });
    return this.groups(rows).map((group) => toRecord(group));
  }

  /** Follow every owner's live events while a list is watched: the subscription lives exactly that long. */
  attach(): () => void {
    this.listeners += 1;
    if (this.listeners === 1) void this.follow();
    let detached = false;
    return () => {
      if (detached) return;
      detached = true;
      this.listeners -= 1;
      if (this.listeners === 0) void this.unfollow();
    };
  }

  private async follow(): Promise<void> {
    let feed: NatlangLiveSubscription;
    try {
      feed = await this.deps.records.subscribeLive({});
    } catch (error) {
      this.deps.failed(error as Error);
      return;
    }
    if (this.listeners === 0) {
      await feed.close().catch(() => undefined);
      return;
    }
    this.feed = feed;
    try {
      for await (const delivery of feed.deliveries as AsyncIterable<NatlangLiveDelivery>) {
        let changed = false;
        for (const event of delivery.events) changed = this.apply(delivery, event) || changed;
        if (changed) this.deps.changed();
      }
    } catch (error) {
      if (this.feed === feed) this.deps.failed(error as Error);
    }
  }

  private async unfollow(): Promise<void> {
    const feed = this.feed;
    this.feed = null;
    this.live.clear();
    await feed?.close().catch(() => undefined);
  }

  /** Fold a root call's start or end into the live view; whether the list changed. */
  private apply(delivery: NatlangLiveDelivery, event: LiveEventJson): boolean {
    if (!isRoot(event) || (event.type !== "call_start" && event.type !== "call_end")) return false;
    if (delivery.runId && this.deps.isOwn(delivery.runId)) return false;
    const known = this.live.get(event.callId);
    const row: CallSummary = known ?? {
      call_id: event.callId,
      parent_call_id: null,
      definition_id: String(event.definitionId ?? ""),
      definition_name: String(event.name ?? event.callId),
      definition_key: String(event.definitionId ?? ""),
      definition_source: null,
      executor: "agent",
      model_id: null,
      outcome: "running",
      started_at: new Date().toISOString(),
      wall_ms: null,
      tokens_in: null,
      tokens_out: null,
      approach_hash: null,
      program_root: null,
      audit_of: null,
      run_label: null,
      owner_kind: delivery.owner.kind,
      owner_key: delivery.owner.objectKey,
      agent_ref: delivery.owner.agentRef ?? null,
      channel_id: delivery.owner.channelId ?? null,
      run_id: delivery.runId ?? null,
    };
    if (event.type === "call_end") {
      row.outcome = String(event["outcome"] ?? "done");
      row.wall_ms = Date.now() - Date.parse(row.started_at);
    }
    this.live.set(event.callId, row);
    return true;
  }

  async stop(id: string): Promise<RunRecord> {
    throw new Error(`${this.describe(id)} belongs to another owner; stop it from where it runs`);
  }

  async remove(id: string): Promise<void> {
    this.hidden.add(this.keyOf(id));
    this.deps.changed();
  }

  private keyOf(id: string): string {
    return id.startsWith(OBSERVED) ? id.slice(OBSERVED.length) : id;
  }

  private describe(id: string): string {
    return `Run ${this.keyOf(id)}`;
  }

  /**
   * Follow a run other owners made: its calls as recorded (their traces replay like a finished run), then, while it is
   * still running, its live events from the records service's fan-out for that run.
   */
  watch(id: string, observer: RunObserver): () => void {
    if (!id.startsWith(OBSERVED)) {
      observer.error?.(new Error(`no run ${id}`));
      return () => {};
    }
    const key = this.keyOf(id);
    const controller = new AbortController();
    let feed: NatlangLiveSubscription | null = null;
    void (async () => {
      try {
        const runId = key.startsWith("call:") ? null : key;
        const calls = runId
          ? await this.deps.records.listCalls({ runId, limit: CALLS })
          : await this.callTree(key.slice("call:".length));
        if (controller.signal.aborted) return;
        const roots = calls.filter((call) => call.parent_call_id === null);
        if (roots.length === 0) {
          observer.error?.(new Error(`no run ${id}`));
          return;
        }
        const replay = await this.replay(calls);
        const run = toRecord({ key, runId, roots }, replay.inputs);
        if (controller.signal.aborted) return;
        observer.connection?.(true);
        observer.update({ run, stdout: replay.stdout, stderr: "", live: replay.events, drained: run.status !== "running" });
        if (run.status !== "running" || !runId) return;
        feed = await this.deps.records.subscribeLive({ runId });
        if (controller.signal.aborted) {
          await feed.close().catch(() => undefined);
          return;
        }
        for await (const delivery of feed.deliveries as AsyncIterable<NatlangLiveDelivery>) {
          const events = delivery.events.map((event) => ({ at: Date.now(), ...event }) as unknown as LiveEvent);
          const finished = delivery.events.some((event) => isRoot(event) && event.type === "call_end");
          const current = finished ? await this.deps.records.listCalls({ runId, limit: CALLS }) : null;
          const next = current
            ? toRecord({ key, runId, roots: current.filter((call) => call.parent_call_id === null) }, replay.inputs)
            : run;
          observer.update({ run: next, stdout: "", stderr: "", live: events, drained: next.status !== "running" });
        }
      } catch (error) {
        if (!controller.signal.aborted) observer.error?.(error as Error);
      }
    })();
    return () => {
      controller.abort();
      void feed?.close().catch(() => undefined);
    };
  }

  private async callTree(rootId: string): Promise<CallSummary[]> {
    const detail = await this.deps.records.getCall(rootId);
    if (!detail) return [];
    const calls = [detail.summary];
    for (let index = 0; index < calls.length; index += 1)
      calls.push(...(await this.deps.records.listCalls({ parentCallId: calls[index]!.call_id, limit: CALLS })));
    return calls;
  }

  /** The live-event form of recorded calls, and the results of the root calls. */
  private async replay(
    calls: readonly CallSummary[]
  ): Promise<{ events: LiveEvent[]; stdout: string; inputs: Record<string, unknown> | undefined }> {
    const ordered = [...calls].sort((a, b) => (a.started_at < b.started_at ? -1 : a.started_at > b.started_at ? 1 : 0));
    const details = await Promise.all(ordered.map((call) => this.deps.records.getCall(call.call_id)));
    const events: LiveEvent[] = [];
    let stdout = "";
    let inputs: Record<string, unknown> | undefined;
    for (const [index, call] of ordered.entries()) {
      const detail = details[index];
      const at = Date.parse(call.started_at);
      const identity = {
        taskId: "",
        callId: call.call_id,
        parentCallId: call.parent_call_id,
        definitionId: call.definition_id,
        name: call.definition_name,
      };
      events.push({ at, type: "call_start", ...identity } as LiveEvent);
      for (const event of parseEvents(detail?.events ?? null) as Array<{ kind?: string }>)
        if (event.kind !== "state" && event.kind !== "reduction")
          events.push({ at, type: "trace", ...identity, event } as unknown as LiveEvent);
      if (call.outcome !== "running")
        events.push({
          at: at + (call.wall_ms ?? 0),
          type: "call_end",
          ...identity,
          outcome: call.outcome,
          detail: detail?.record?.detail ?? "",
        } as LiveEvent);
      const firstRoot = call.parent_call_id === null && !ordered.slice(0, index).some((earlier) => earlier.parent_call_id === null);
      if (call.parent_call_id === null && detail?.record) {
        const expanded = await expandRecord(detail.record, (hash) => this.deps.records.getValue(hash));
        if (firstRoot) inputs = expanded["inputs"] as Record<string, unknown>;
        const value = expanded["output"];
        stdout += `${call.definition_name}: ${typeof value === "string" ? value : JSON.stringify(value, null, 2)}\n`;
      }
    }
    return { events, stdout, inputs };
  }
}
