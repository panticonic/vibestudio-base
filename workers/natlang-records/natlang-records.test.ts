import { describe, expect, it } from "vitest";
import { createTestDO } from "@workspace/runtime/worker/test-utils";
import { DURABLE_OBJECT_FRAMEWORK_RPC_METHODS } from "@vibestudio/durable";
import {
  rpcExposedMethodNames,
  rpcMethodAuthority,
  type AuthenticatedCaller,
} from "@vibestudio/rpc";
import { sha256HexSyncText } from "@vibestudio/content-addressing";
import { readChannelSubscriptionRecords } from "@vibestudio/service-schemas/channel";
import {
  natlangRecordsRpcMethods,
  type CallRecordJson,
  type NatlangLiveDelivery,
  type NatlangLiveSubscribed,
  type NatlangOwner,
  type NatlangRecordInput,
} from "@workspace/natlang-records/contract";
import { NatlangRecordsDO } from "./NatlangRecordsDO.js";

const OWNER: NatlangOwner = {
  kind: "agent",
  objectKey: "agent-1",
  agentRef: "agent:alpha",
  channelId: "channel-1",
};
const ROOT = "/programs/triage";

const caller = (callerId: string) => ({ callerId, callerKind: "worker" }) as AuthenticatedCaller;

/** Test seam: the authenticated caller and a small blob bound. */
class Records extends NatlangRecordsDO {
  testCaller: AuthenticatedCaller | null = caller("caller-1");
  budget = Number.MAX_SAFE_INTEGER;
  protected override get caller(): AuthenticatedCaller | null {
    return this.testCaller;
  }
  protected override blobBudgetBytes() {
    return this.budget;
  }
  release() {
    this.beginLifecycleRelease({
      epoch: "release",
      phase: "quiesce",
      mode: "suspend",
      reason: "test",
      deadlineMs: 0,
    });
  }
}

async function create() {
  const { instance } = await createTestDO(Records);
  return instance;
}

const blobOf = (value: unknown) => {
  const text = JSON.stringify(value);
  return { hash: sha256HexSyncText(text), text };
};

interface RecordOptions {
  callId: string;
  parent?: string | null;
  startedAt?: string;
  outcome?: string;
  source?: string | null;
  programRoot?: string | null;
  input?: unknown;
  output?: unknown;
  incompleteInput?: boolean;
  auditOf?: string | null;
  definitionName?: string;
  padding?: string;
  runId?: string;
  owner?: NatlangOwner;
  events?: string;
}

/** A `natlang.calls/1` record with one input (`text`) and an output, and the blobs it references. */
function makeRecord(options: RecordOptions): NatlangRecordInput {
  const input = blobOf(options.input ?? "hello");
  const output = blobOf(options.output ?? "billing");
  const blobs: Record<string, string> = { [input.hash]: input.text, [output.hash]: output.text };
  if (options.padding) {
    const pad = blobOf(options.padding);
    blobs[pad.hash] = pad.text;
  }
  const record: CallRecordJson = {
    version: "natlang.calls/1",
    call_id: options.callId,
    parent_call_id: options.parent ?? null,
    parent_action_index: options.parent ? 0 : null,
    task_id: "task-1",
    program_id: "triage",
    program_root: options.programRoot === undefined ? ROOT : options.programRoot,
    definition: {
      id: "triage.classify",
      name: options.definitionName ?? "classify",
      source: options.source === undefined ? "classify.nl" : options.source,
      key: "key-1",
      interface: "iface-1",
      site: "named",
    },
    executor: { kind: "agent", model_id: "local:lfm3", model_revision: null },
    inputs: {
      text: options.incompleteInput
        ? { complete: false, reason: "oversize" }
        : { complete: true, hash: input.hash, bytes: input.text.length },
    },
    captures: {},
    output: { complete: true, hash: output.hash, bytes: output.text.length },
    outcome: options.outcome ?? "done",
    detail: "",
    started_at: options.startedAt ?? "2026-01-01T00:00:00.000Z",
    ended_at: options.startedAt ?? "2026-01-01T00:00:01.000Z",
    effects: [],
    cost: { model_requests: 1, tokens_in: 10, tokens_out: 5, wall_ms: 120, turns: 1, evals: 1 },
    approach: { evals: [], hash: "approach-1" },
    audit_of: options.auditOf ?? null,
    events: null,
  };
  return {
    owner: options.owner ?? OWNER,
    ...(options.runId ? { runId: options.runId } : {}),
    record,
    blobs,
    ...(options.events !== undefined ? { events: options.events } : {}),
  };
}

const begin = (records: Records, callId: string, extra: Partial<Parameters<Records["begin"]>[0]> = {}) =>
  records.begin({
    owner: OWNER,
    callId,
    parentCallId: null,
    parentActionIndex: null,
    taskId: "task-1",
    programId: "triage",
    programRoot: ROOT,
    definition: {
      id: "triage.classify",
      name: "classify",
      source: "classify.nl",
      key: "key-1",
      interface: "iface-1",
      site: "named",
    },
    modelId: "local:lfm3",
    startedAt: "2026-01-01T00:00:00.000Z",
    auditOf: null,
    ...extra,
  });

describe("call lifecycle", () => {
  it("shows a running call, takes progress, and replaces the row on record", async () => {
    const records = await create();
    await begin(records, "call-1", { runId: "run-1" });
    expect(await records.listCalls({})).toMatchObject([
      {
        call_id: "call-1",
        outcome: "running",
        tokens_in: null,
        owner_kind: "agent",
        owner_key: "agent-1",
        agent_ref: "agent:alpha",
        channel_id: "channel-1",
        run_id: "run-1",
      },
    ]);
    expect(await records.getCall({ callId: "call-1" })).toMatchObject({ record: null, events: null });

    await records.progress({ callId: "call-1", events: '{"kind":"model_request"}\n' });
    await records.progress({ callId: "call-1", events: '{"kind":"model_request"}\n{"kind":"action"}\n' });
    expect((await records.getCall({ callId: "call-1" }))?.events).toBe(
      '{"kind":"model_request"}\n{"kind":"action"}\n',
    );

    const input = makeRecord({ callId: "call-1", runId: "run-1", events: '{"kind":"done"}\n' });
    expect(await records.record(input)).toEqual({ recordId: "call-1" });
    const detail = await records.getCall({ callId: "call-1" });
    expect(detail?.summary).toMatchObject({
      outcome: "done",
      wall_ms: 120,
      tokens_in: 10,
      tokens_out: 5,
      model_id: "local:lfm3",
      run_id: "run-1",
    });
    expect(detail?.record?.call_id).toBe("call-1");
    expect(detail?.events).toBe('{"kind":"done"}\n');
    const eventsRef = detail?.record?.events as { complete: boolean; hash: string };
    expect(eventsRef.complete).toBe(true);
    expect(await records.getValue({ hash: eventsRef.hash })).toBe('{"kind":"done"}\n');
    expect(await records.listCalls({})).toHaveLength(1);
  });

  it("keeps a started row on a repeated begin and ignores stale progress", async () => {
    const records = await create();
    await begin(records, "call-1");
    await begin(records, "call-1", { modelId: "other" });
    expect((await records.listCalls({}))[0]?.model_id).toBe("local:lfm3");
    await records.record(makeRecord({ callId: "call-1" }));
    await records.progress({ callId: "call-1", events: "late\n" });
    expect((await records.getCall({ callId: "call-1" }))?.events).toBeNull();
    await records.progress({ callId: "never-started", events: "x\n" });
    expect(await records.getCall({ callId: "never-started" })).toBeNull();
  });

  it("is idempotent per call ID and frees what a re-record no longer references", async () => {
    const records = await create();
    const first = makeRecord({ callId: "call-1", output: "billing", events: "a\n" });
    await records.record(first);
    await records.record(first);
    expect(await records.listCalls({})).toHaveLength(1);
    const outputHash = blobOf("billing").hash;
    expect(await records.getValue({ hash: outputHash })).not.toBeNull();
    await records.record(makeRecord({ callId: "call-1", output: "sales", events: "b\n" }));
    expect(await records.getValue({ hash: outputHash })).toBeNull();
    expect((await records.getCall({ callId: "call-1" }))?.events).toBe("b\n");
  });

  it("discards a running row but never a recorded call", async () => {
    const records = await create();
    await begin(records, "call-1");
    await records.progress({ callId: "call-1", events: "x\n" });
    await records.discard({ callId: "call-1" });
    expect(await records.getCall({ callId: "call-1" })).toBeNull();
    expect(await records.getValue({ hash: sha256HexSyncText("x\n") })).toBeNull();
    await records.record(makeRecord({ callId: "call-2" }));
    await records.discard({ callId: "call-2" });
    expect(await records.getCall({ callId: "call-2" })).not.toBeNull();
  });

  it("rejects a blob that is not the SHA-256 of its text", async () => {
    const records = await create();
    const input = makeRecord({ callId: "call-1" });
    input.blobs["0".repeat(64)] = "forged";
    await expect(records.record(input)).rejects.toThrow(/not the SHA-256/);
    expect(await records.getCall({ callId: "call-1" })).toBeNull();
  });
});

describe("listCalls", () => {
  async function populated() {
    const records = await create();
    const other: NatlangOwner = { kind: "panel", objectKey: "panel-1", channelId: "channel-2" };
    await records.record(makeRecord({ callId: "a", startedAt: "2026-01-01T00:00:01.000Z", runId: "run-1" }));
    await records.record(
      makeRecord({
        callId: "b",
        startedAt: "2026-01-01T00:00:02.000Z",
        runId: "run-1",
        parent: "a",
      }),
    );
    await records.record(
      makeRecord({
        callId: "c",
        startedAt: "2026-01-01T00:00:03.000Z",
        runId: "run-2",
        owner: other,
        outcome: "failed",
        source: "route.nl",
        definitionName: "route",
      }),
    );
    await records.record(
      makeRecord({ callId: "d", startedAt: "2026-01-01T00:00:04.000Z", auditOf: "a" }),
    );
    return records;
  }
  const ids = (calls: Array<{ call_id: string }>) => calls.map((call) => call.call_id);

  it("filters by run, owner, definition, outcome, time and parent", async () => {
    const records = await populated();
    expect(ids(await records.listCalls({}))).toEqual(["c", "b", "a"]);
    expect(ids(await records.listCalls({ runId: "run-1" }))).toEqual(["b", "a"]);
    expect(ids(await records.listCalls({ agentRef: "agent:alpha" }))).toEqual(["b", "a"]);
    expect(ids(await records.listCalls({ channelId: "channel-2" }))).toEqual(["c"]);
    expect(ids(await records.listCalls({ ownerKey: "panel-1" }))).toEqual(["c"]);
    expect(ids(await records.listCalls({ definition: "route" }))).toEqual(["c"]);
    expect(ids(await records.listCalls({ definition: "route.nl" }))).toEqual(["c"]);
    expect(ids(await records.listCalls({ definition: "classify" }))).toEqual(["b", "a"]);
    expect(ids(await records.listCalls({ definition: "triage.classify" }))).toEqual(["c", "b", "a"]);
    expect(ids(await records.listCalls({ outcome: "failed" }))).toEqual(["c"]);
    expect(ids(await records.listCalls({ since: "2026-01-01T00:00:02.000Z" }))).toEqual(["c", "b"]);
    expect(ids(await records.listCalls({ parentCallId: null }))).toEqual(["c", "a"]);
    expect(ids(await records.listCalls({ parentCallId: "a" }))).toEqual(["b"]);
    expect(ids(await records.listCalls({ audits: true }))).toEqual(["d", "c", "b", "a"]);
  });

  it("pages newest first and bounds the page size", async () => {
    const records = await populated();
    const first = await records.listCalls({ limit: 2 });
    expect(ids(first)).toEqual(["c", "b"]);
    expect(ids(await records.listCalls({ limit: 2, after: "b" }))).toEqual(["a"]);
    await expect(records.listCalls({ limit: 501 })).rejects.toThrow();
  });
});

describe("getCall and annotations", () => {
  it("returns null for an unknown call, and annotations in order", async () => {
    const records = await create();
    expect(await records.getCall({ callId: "nope" })).toBeNull();
    await expect(records.annotate({ callId: "nope", kind: "note", value: 1 })).rejects.toThrow(/No call/);
    await records.record(makeRecord({ callId: "call-1" }));
    await records.annotate({ callId: "call-1", kind: "note", value: { a: 1 }, source: "test" });
    await records.annotate({ callId: "call-1", kind: "score", value: 0.5 });
    const detail = await records.getCall({ callId: "call-1" });
    expect(detail?.annotations).toMatchObject([
      { kind: "note", value: { a: 1 }, source: "test" },
      { kind: "score", value: 0.5, source: null },
    ]);
  });
});

describe("feedback", () => {
  it("turns a good verdict on a done root call into a tune example", async () => {
    const records = await create();
    await records.record(makeRecord({ callId: "call-1" }));
    const result = await records.feedback({ callId: "call-1", verdict: "good" });
    expect(result.example).toMatchObject({
      function: "classify.nl",
      input: { text: "hello" },
      expected: "billing",
      producer: "local:lfm3",
    });
    expect(result.example?.group).toMatch(/^feedback-20260101-[0-9a-f]{8}$/);
    expect(result.message).toContain("annotated call-1 as good; appended to the tune examples of /programs/triage");
    const detail = await records.getCall({ callId: "call-1" });
    expect(detail?.annotations).toMatchObject([{ kind: "feedback", value: { verdict: "good" } }]);
    const examples = await records.tuneExamples({});
    expect(examples.count).toBe(1);
    expect(JSON.parse(examples.jsonl.trim())).toEqual(result.example);
    expect(examples.jsonl.endsWith("\n")).toBe(true);
    // The same verdict again changes nothing.
    expect((await records.feedback({ callId: "call-1", verdict: "good" })).message).toContain("already in");
    expect((await records.tuneExamples({})).count).toBe(1);
  });

  it("fix and bad-with-expected replace the expected result of the same input", async () => {
    const records = await create();
    await records.record(makeRecord({ callId: "call-1" }));
    await records.record(makeRecord({ callId: "call-2", outcome: "failed" }));
    await records.feedback({ callId: "call-1", verdict: "good" });
    const fixed = await records.feedback({
      callId: "call-2",
      verdict: "fix",
      expected: "sales",
      group: "g1",
    });
    expect(fixed.message).toContain("updated the expected result in");
    // The earlier line keeps its group; the verdict changed its expected result and producer.
    expect(fixed.example).toMatchObject({ expected: "sales", producer: "tester" });
    expect(fixed.example?.group).toMatch(/^feedback-/);
    expect(JSON.parse((await records.tuneExamples({})).jsonl.trim())).toEqual(fixed.example);
    expect((await records.tuneExamples({})).count).toBe(1);
    const bad = await records.feedback({ callId: "call-1", verdict: "bad", expected: null });
    expect(bad.example).toMatchObject({ expected: null });
  });

  it("an explicit group names a new example", async () => {
    const records = await create();
    await records.record(makeRecord({ callId: "call-1" }));
    const result = await records.feedback({ callId: "call-1", verdict: "fix", expected: "x", group: "mine" });
    expect(result.example?.group).toBe("mine");
  });

  it("bad without an expected result annotates only", async () => {
    const records = await create();
    await records.record(makeRecord({ callId: "call-1" }));
    const result = await records.feedback({ callId: "call-1", verdict: "bad" });
    expect(result.example).toBeNull();
    expect(result.message).toBe(
      "annotated call-1 as bad; no example appended (give the right answer as expected)",
    );
    expect((await records.tuneExamples({})).count).toBe(0);
    expect((await records.getCall({ callId: "call-1" }))?.annotations).toHaveLength(1);
  });

  it("refuses what cannot be a program example, after annotating", async () => {
    const records = await create();
    await records.record(makeRecord({ callId: "root" }));
    await records.record(makeRecord({ callId: "child", parent: "root" }));
    await records.record(makeRecord({ callId: "audit", auditOf: "root" }));
    await records.record(makeRecord({ callId: "inline", source: null, definitionName: "inline" }));
    await records.record(makeRecord({ callId: "noroot", programRoot: null }));
    await records.record(makeRecord({ callId: "partial", incompleteInput: true }));
    await records.record(makeRecord({ callId: "failed", outcome: "failed" }));

    const refusal = (callId: string, verdict: "good" | "fix" = "good") =>
      records.feedback({ callId, verdict, ...(verdict === "fix" ? { expected: "x" } : {}) });
    await expect(refusal("child")).rejects.toThrow(
      "annotated child as good; not added as a tune example: call child ran inside root; give feedback on the root call",
    );
    await expect(refusal("audit")).rejects.toThrow("call audit is an audit of root, not a program call");
    await expect(refusal("inline")).rejects.toThrow(
      "the trace of inline records no program .nl file (source none), so it names no tune root function",
    );
    await expect(refusal("noroot")).rejects.toThrow("the trace records no program root");
    await expect(refusal("partial")).rejects.toThrow(
      "input text of partial was not recorded completely (recording excludes or truncates it)",
    );
    await expect(refusal("failed")).rejects.toThrow(
      "call failed ended failed, so its output is not an expected result; give a fix verdict with expected",
    );
    expect((await records.tuneExamples({})).count).toBe(0);
    // The verdicts stay on the calls even though no example came of them.
    expect((await records.getCall({ callId: "child" }))?.annotations).toHaveLength(1);

    await expect(records.feedback({ callId: "root", verdict: "fix" })).rejects.toThrow(/needs expected/);
    expect((await records.getCall({ callId: "root" }))?.annotations).toHaveLength(0);
    await expect(refusal("unknown")).rejects.toThrow("no call unknown");
    await begin(records, "running");
    await expect(refusal("running")).rejects.toThrow(/still running/);
  });

  it("never changes a protected example, and imports a program's examples", async () => {
    const records = await create();
    const protectedLine = {
      function: "classify.nl",
      input: { text: "hello" },
      expected: "kept",
      group: "held-out",
      protected: true,
    };
    const loose = { function: "classify.nl", input: { text: "other" }, expected: "a", group: "g" };
    const counts = await records.importExamples({
      program: ROOT,
      jsonl: `${JSON.stringify(protectedLine)}\n${JSON.stringify(loose)}\n`,
    });
    expect(counts).toEqual({ added: 2, updated: 0, unchanged: 0 });
    expect(await records.importExamples({ program: ROOT, jsonl: JSON.stringify(loose) })).toEqual({
      added: 0,
      updated: 0,
      unchanged: 1,
    });
    await records.record(makeRecord({ callId: "call-1" }));
    await expect(records.feedback({ callId: "call-1", verdict: "good" })).rejects.toThrow(
      /protected example; it is kept unchanged/,
    );
    const lines = (await records.tuneExamples({ program: ROOT })).jsonl.trim().split("\n").map((l) => JSON.parse(l));
    expect(lines).toEqual([protectedLine, loose]);
    await expect(records.importExamples({ program: ROOT, jsonl: "not json" })).rejects.toThrow(/not JSON/);
  });

  it("keeps examples per program and filters them", async () => {
    const records = await create();
    await records.record(makeRecord({ callId: "a" }));
    await records.record(makeRecord({ callId: "b", programRoot: "/programs/other" }));
    await records.feedback({ callId: "a", verdict: "good" });
    await records.feedback({ callId: "b", verdict: "good" });
    expect((await records.tuneExamples({})).count).toBe(2);
    expect((await records.tuneExamples({ program: "/programs/other" })).count).toBe(1);
    expect(await records.tuneExamples({ program: "/nowhere" })).toEqual({ jsonl: "", count: 0 });
  });
});

describe("live events", () => {
  async function open(records: Records, filter = {}) {
    const response = await records.subscribeLive(filter);
    const iterator = readChannelSubscriptionRecords<NatlangLiveSubscribed, NatlangLiveDelivery>({
      status: response.status,
      body: response.body,
    })[Symbol.asyncIterator]();
    const ack = await iterator.next();
    if (ack.done || ack.value.kind !== "subscribed") throw new Error("no acknowledgement");
    return { iterator, subscriptionId: ack.value.result.subscriptionId };
  }
  const event = (callId: string) => ({ type: "call_start", callId, name: "classify" });

  it("stores and delivers nothing without a subscriber", async () => {
    const records = await create();
    expect(await records.liveInterest()).toEqual({ subscribed: false });
    expect(await records.publishLive({ owner: OWNER, events: [event("c1")] })).toEqual({ delivered: 0 });
    expect(await records.listCalls({})).toEqual([]);
  });

  it("delivers to matching subscribers until they unsubscribe", async () => {
    const records = await create();
    const all = await open(records);
    const mine = await open(records, { agentRef: "agent:alpha", runId: "run-1" });
    const elsewhere = await open(records, { channelId: "channel-9" });
    expect(await records.liveInterest()).toEqual({ subscribed: true });

    expect(
      await records.publishLive({ owner: OWNER, runId: "run-1", events: [event("c1"), event("c2")] }),
    ).toEqual({ delivered: 2 });
    expect(await records.publishLive({ owner: OWNER, runId: "run-2", events: [event("c3")] })).toEqual({
      delivered: 1,
    });

    const first = await all.iterator.next();
    expect(first.value).toEqual({
      kind: "message",
      payload: { owner: OWNER, runId: "run-1", events: [event("c1"), event("c2")] },
    });
    expect((await mine.iterator.next()).value).toMatchObject({ kind: "message" });
    expect((await all.iterator.next()).value).toMatchObject({
      payload: { runId: "run-2" },
    });

    await records.unsubscribeLive({ subscriptionId: all.subscriptionId });
    expect((await all.iterator.next()).done).toBe(true);
    expect(await records.publishLive({ owner: OWNER, runId: "run-1", events: [event("c4")] })).toEqual({
      delivered: 1,
    });
    // Nothing is persisted.
    expect(await records.listCalls({})).toEqual([]);

    await mine.iterator.return?.(undefined);
    await elsewhere.iterator.return?.(undefined);
  });

  it("drops a subscriber whose response is cancelled", async () => {
    const records = await create();
    const subscription = await open(records);
    expect((await records.liveInterest()).subscribed).toBe(true);
    await subscription.iterator.return?.(undefined);
    expect(await records.liveInterest()).toEqual({ subscribed: false });
    expect(await records.publishLive({ owner: OWNER, events: [event("c1")] })).toEqual({ delivered: 0 });
  });

  it("only the subscribing caller can end a subscription", async () => {
    const records = await create();
    const subscription = await open(records);
    records.testCaller = caller("intruder");
    await records.unsubscribeLive({ subscriptionId: subscription.subscriptionId });
    expect(await records.liveInterest()).toEqual({ subscribed: true });
    records.testCaller = caller("caller-1");
    await records.unsubscribeLive({ subscriptionId: subscription.subscriptionId });
    expect(await records.liveInterest()).toEqual({ subscribed: false });
    await records.unsubscribeLive({ subscriptionId: subscription.subscriptionId });
  });

  it("requires an authenticated caller, and retirement ends subscriptions", async () => {
    const records = await create();
    records.testCaller = null;
    await expect(records.subscribeLive({})).rejects.toThrow(/authenticated caller/);
    records.testCaller = caller("caller-1");
    const subscription = await open(records);
    records.release();
    expect((await subscription.iterator.next()).done).toBe(true);
    expect(await records.liveInterest()).toEqual({ subscribed: false });
  });

  it("ends a subscriber that cannot keep up instead of dropping events silently", async () => {
    const records = await create();
    const response = await records.subscribeLive({});
    const reader = response.body!.getReader();
    const big = { type: "model_delta", callId: "c1", text: "x".repeat(400_000) };
    let delivered = 0;
    for (let i = 0; i < 4; i += 1)
      delivered += (await records.publishLive({ owner: OWNER, events: [big] })).delivered;
    expect(delivered).toBeLessThan(4);
    expect(await records.liveInterest()).toEqual({ subscribed: false });
    await expect(
      (async () => {
        for (;;) if ((await reader.read()).done) return;
      })(),
    ).rejects.toThrow(/Live subscription terminated/);
  });
});

describe("retention bound", () => {
  const padding = (n: number) => "p".repeat(n) + n;
  const accounted = (records: Records) => (records as unknown as { blobBytes: number }).blobBytes;

  it("evicts event streams, then the oldest finished unpinned calls, and their blobs", async () => {
    const { instance: records, sql } = await createTestDO(Records);
    // Each call carries ~4 KiB of value bytes, 1 KiB of events and its record document.
    for (let i = 1; i <= 6; i += 1)
      await records.record(
        makeRecord({
          callId: `call-${i}`,
          startedAt: `2026-01-01T00:00:0${i}.000Z`,
          padding: padding(4000 + i),
          events: `${"e".repeat(1000)}${i}\n`,
        }),
      );
    await records.feedback({ callId: "call-1", verdict: "good" }); // annotated, so pinned
    await begin(records, "running", { startedAt: "2025-12-31T00:00:00.000Z" });
    await records.progress({ callId: "running", events: "r".repeat(2000) });

    records.budget = 16_000;
    await records.record(
      makeRecord({ callId: "call-7", startedAt: "2026-01-01T00:00:07.000Z", padding: padding(4007), events: "e7\n" }),
    );

    // The pinned call and the running row survive; the oldest unpinned finished calls are gone.
    expect((await records.getCall({ callId: "call-1" }))?.events).toContain("e");
    expect((await records.getCall({ callId: "running" }))?.events).toBeNull();
    expect(await records.getCall({ callId: "call-2" })).toBeNull();
    expect(await records.getCall({ callId: "call-7" })).not.toBeNull();
    expect(await records.getValue({ hash: blobOf(padding(4002)).hash })).toBeNull();
    const total = Number(sql.exec(`SELECT SUM(bytes) AS n FROM blobs`).one()["n"]);
    expect(total).toBeLessThanOrEqual(16_000);
    expect(accounted(records)).toBe(total);
  });

  it("keeps the newest calls and an accurate byte count", async () => {
    const { instance: records, sql } = await createTestDO(Records);
    records.budget = 7000;
    for (let i = 1; i <= 8; i += 1)
      await records.record(
        makeRecord({
          callId: `call-${i}`,
          startedAt: `2026-01-01T00:00:0${i}.000Z`,
          padding: "q".repeat(3000) + i,
        }),
      );
    expect((await records.listCalls({})).map((call) => call.call_id)).toEqual(["call-8"]);
    const total = Number(sql.exec(`SELECT SUM(bytes) AS n FROM blobs`).one()["n"]);
    expect(total).toBeLessThanOrEqual(7000);
    expect(accounted(records)).toBe(total);
  });
});

const evaluation = (overrides: { id?: string; path?: string; split?: "train" | "validation" | "test"; quality?: number | null; gatesPassed?: boolean } = {}) => ({
  template: "base",
  suite: { id: overrides.id ?? "triage", path: overrides.path ?? "skills/triage/suite.ts", hash: "h1", cases: { train: 3, validation: 2 } },
  split: overrides.split ?? ("validation" as const),
  artifact: null,
  natlang: { commit: "c5740cf" },
  executorIdentity: { id: "gateway:local:lfm3", configuration: { model: "local:lfm3" } },
  summary: {
    quality: overrides.quality === undefined ? 0.75 : overrides.quality,
    cases: 2,
    gatesPassed: overrides.gatesPassed ?? true,
    modelCalls: 5,
    meanLatencyMs: 1200,
  },
  cases: [
    { caseId: "a", status: "scored", quality: 1 },
    { caseId: "b", status: "scored", quality: 0.5 },
  ],
  budget: { limits: { maxRollouts: 10 }, ledger: { rollouts: 2 } },
});

describe("evaluations", () => {
  it("keeps the summary of a suite run and lists the latest per program, suite and split", async () => {
    const records = await create();
    await records.recordEvaluation({ evaluation: evaluation({ quality: 0.5 }), ranAt: "2026-11-01T10:00:00.000Z" });
    await records.recordEvaluation({ evaluation: evaluation({ quality: 0.9 }), ranAt: "2026-11-02T10:00:00.000Z" });
    await records.recordEvaluation({ evaluation: evaluation({ split: "test", gatesPassed: false }), ranAt: "2026-11-02T11:00:00.000Z" });
    await records.recordEvaluation({ evaluation: evaluation({ id: "other", path: "skills/other/suite.ts" }), ranAt: "2026-11-03T10:00:00.000Z" });

    const all = await records.listEvaluations({});
    expect(all.map((entry) => [entry.program, entry.evaluation.split, entry.evaluation.summary.quality])).toEqual([
      ["skills/other", "validation", 0.75],
      ["skills/triage", "test", 0.75],
      ["skills/triage", "validation", 0.9],
      ["skills/triage", "validation", 0.5],
    ]);

    const latest = await records.listEvaluations({ latest: true });
    expect(latest.map((entry) => [entry.program, entry.evaluation.split, entry.evaluation.summary.quality])).toEqual([
      ["skills/other", "validation", 0.75],
      ["skills/triage", "test", 0.75],
      ["skills/triage", "validation", 0.9],
    ]);
    expect(latest[1]!.evaluation.summary.gatesPassed).toBe(false);
    expect((await records.listEvaluations({ program: "skills/triage", split: "validation", limit: 1 })).map((entry) => entry.ranAt)).toEqual([
      "2026-11-02T10:00:00.000Z",
    ]);
  });

  it("reports what the store holds", async () => {
    const records = await create();
    await records.record(makeRecord({ callId: "done-1" }));
    await begin(records, "running-1");
    await records.recordEvaluation({ evaluation: evaluation() });
    const stats = await records.stats();
    expect(stats).toMatchObject({ calls: 1, running: 1, evaluations: 1, blobBudgetBytes: Number.MAX_SAFE_INTEGER });
    expect(stats.blobBytes).toBeGreaterThan(0);
  });

  it("refuses a record that is not a summary", async () => {
    const records = await create();
    await expect(records.recordEvaluation({ evaluation: { ...evaluation(), extra: 1 } as never })).rejects.toThrow();
    await expect(
      records.recordEvaluation({ evaluation: { ...evaluation(), budget: "x".repeat(300 * 1024) } }),
    ).rejects.toThrow(/at most 262144 bytes/);
  });
});

describe("contract and authority", () => {
  it("exposes exactly the contract's methods, each closed to websites and open to the same principals", async () => {
    const { instance } = await createTestDO(Records);
    const exposed = [...rpcExposedMethodNames(instance)]
      .filter((method) => !DURABLE_OBJECT_FRAMEWORK_RPC_METHODS.has(method))
      .sort();
    expect(exposed).toEqual(Object.keys(natlangRecordsRpcMethods).sort());
    for (const method of exposed) {
      const authority = rpcMethodAuthority(instance, method);
      expect(authority, method).toMatchObject({
        website: { kind: "closed" },
        principals: ["host", "user", "code", "session", "mission"],
        effect: { kind: "open" },
        tier: "open",
      });
    }
    const sensitivity = (method: string) => rpcMethodAuthority(instance, method)?.sensitivity;
    for (const method of ["listCalls", "getCall", "getValue", "tuneExamples", "liveInterest", "subscribeLive", "listEvaluations", "stats"])
      expect(sensitivity(method), method).toBe("read");
    for (const method of ["begin", "progress", "discard", "record", "annotate", "feedback", "importExamples", "publishLive", "unsubscribeLive", "recordEvaluation"])
      expect(sensitivity(method), method).toBe("write");
  });
});
