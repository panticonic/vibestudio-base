import { describe, expect, it } from "vitest";
import { parseEvents, tracesApi } from "./tracesApi.js";
import { addFinishedCall, fakePorts, summary } from "./testSupport.js";

describe("tracesApi", () => {
  it("lists recorded calls as the Traces page reads them, filtered by definition, outcome, program and executor", async () => {
    const { ports, records } = fakePorts();
    records.calls = [
      summary({ call_id: "a", started_at: "2026-11-01T10:00:00.000Z", program_root: "skills/triage" }),
      summary({ call_id: "b", started_at: "2026-11-01T11:00:00.000Z", program_root: "skills/other", definition_name: "other", definition_id: "o", outcome: "failed", model_id: "hosted:claude" }),
      summary({ call_id: "c", started_at: "2026-11-01T12:00:00.000Z", program_root: "/work/ctx/skills/triage", parent_call_id: "a" }),
    ];
    const traces = tracesApi(ports);
    const all = await traces.list({});
    expect(all.map((row) => row["call_id"])).toEqual(["c", "b", "a"]);
    expect(all[0]).toMatchObject({ definition_name: "classify", outcome: "done", executor: "local:lfm3-1.7b", tokens_in: 100 });
    expect((await traces.list({ definition: "other" })).map((row) => row["call_id"])).toEqual(["b"]);
    expect((await traces.list({ outcome: "failed" })).map((row) => row["call_id"])).toEqual(["b"]);
    // The service indexes calls by definition, not by workspace program, so a program matches by its recorded root.
    expect((await traces.list({ program: "skills/triage" })).map((row) => row["call_id"])).toEqual(["c", "a"]);
    expect((await traces.list({ executor: "hosted" })).map((row) => row["call_id"])).toEqual(["b"]);
    expect(await traces.list({ limit: 1 })).toHaveLength(1);
  });

  it("ranks the busiest functions", async () => {
    const { ports, records } = fakePorts();
    records.calls = [
      summary({ call_id: "a", tokens_in: 10, tokens_out: 1, wall_ms: 5 }),
      summary({ call_id: "b", tokens_in: 20, tokens_out: 2, wall_ms: 5 }),
      summary({ call_id: "c", definition_key: "k2", definition_name: "other", tokens_in: 1000, tokens_out: 0, wall_ms: 1 }),
    ];
    const traces = tracesApi(ports);
    expect((await traces.hot("calls"))[0]).toMatchObject({ definition_name: "classify", calls: 2, tokens: 33 });
    expect((await traces.hot("tokens"))[0]).toMatchObject({ definition_name: "other", tokens: 1000 });
  });

  it("opens a call with its values in place of their references, its children and annotations", async () => {
    const { ports, records } = fakePorts();
    addFinishedCall(records, { call_id: "root" }, { inputs: { text: "hello" }, output: "billing" });
    addFinishedCall(records, { call_id: "child", parent_call_id: "root", definition_name: "inner" });
    records.details.get("root")!.annotations = [{ kind: "feedback", value: { verdict: "good" }, source: "feedback", created_at: "2026-11-01T10:05:00.000Z" }];
    const value = await tracesApi(ports).get("root");
    expect(value["record"].inputs).toEqual({ text: "hello" });
    expect(value["record"].output).toBe("billing");
    expect(value["record"].definition.instructions).toBe("Classify.");
    expect(value["children"].map((child: { call_id: string }) => child.call_id)).toEqual(["child"]);
    expect(value["annotations"]).toHaveLength(1);
  });

  it("keeps a reference the store no longer holds, and shows a running call without a record", async () => {
    const { ports, records } = fakePorts();
    const record = addFinishedCall(records, { call_id: "evicted" });
    records.values.delete((record.output as { hash: string }).hash);
    const traces = tracesApi(ports);
    expect((await traces.get("evicted"))["record"].output).toMatchObject({ complete: true });
    records.calls.push(summary({ call_id: "live", outcome: "running" }));
    records.details.set("live", { record: null, events: '{"kind":"model_request"}' });
    expect(await traces.get("live")).toMatchObject({ running: { call_id: "live", outcome: "running" }, events: [{ kind: "model_request" }] });
    await expect(traces.get("nope")).rejects.toMatchObject({ status: 404 });
  });

  it("reads a call's trace events from ndjson or a JSON array", async () => {
    expect(parseEvents('{"kind":"a"}\n{"kind":"b"}\n')).toEqual([{ kind: "a" }, { kind: "b" }]);
    expect(parseEvents('[{"kind":"a"}]')).toEqual([{ kind: "a" }]);
    expect(parseEvents(null)).toEqual([]);
    const { ports, records } = fakePorts();
    addFinishedCall(records, { call_id: "x" }, { events: [{ kind: "model_request", phase: "end" }] });
    expect(await tracesApi(ports).events("x")).toEqual([{ kind: "model_request", phase: "end" }]);
  });

  it("gives feedback through the service and writes the stored tune examples into the program folder", async () => {
    const { ports, records, fs } = fakePorts({ files: { "skills/triage/classify.nl": "x" } });
    addFinishedCall(records, { call_id: "x", program_root: "skills/triage" });
    records.tuneExample = { function: "classify.nl", input: { text: "hello" }, group: "g", producer: "tester" };
    records.tune = '{"function":"classify.nl"}\n';
    const traces = tracesApi(ports);
    const good = await traces.feedback("x", { verdict: "good" });
    expect(records.feedbacks).toEqual([{ callId: "x", verdict: "good" }]);
    expect(good.message).toContain("wrote skills/triage/tune.examples.jsonl");
    expect(fs.files["skills/triage/tune.examples.jsonl"]).toBe('{"function":"classify.nl"}\n');
    await traces.feedback("x", { verdict: "fix", expected: "urgent" });
    expect(records.feedbacks.at(-1)).toEqual({ callId: "x", verdict: "fix", expected: "urgent" });
  });

  it("writes no file when the verdict stores no example or the program is not a folder of this workspace", async () => {
    const { ports, records, fs } = fakePorts();
    addFinishedCall(records, { call_id: "x", program_root: "/elsewhere/not-here" });
    const traces = tracesApi(ports);
    expect((await traces.feedback("x", { verdict: "bad" })).message).toBe("annotated x as bad");
    records.tuneExample = { function: "classify.nl", input: {}, group: "g", producer: "tester" };
    expect((await traces.feedback("x", { verdict: "good" })).message).toBe("annotated x as good");
    expect(fs.writes).toEqual([]);
  });

  it("pins a call by annotating it", async () => {
    const { ports, records } = fakePorts();
    await tracesApi(ports).pin("x", true);
    expect(records.annotated).toEqual([{ callId: "x", kind: "pin", value: { pinned: true }, source: "natlang panel" }]);
  });
});

