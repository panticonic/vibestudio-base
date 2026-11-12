import { describe, expect, it, vi } from "vitest";
import type { RunChunk, RunRecord } from "@workspace/natlang/dashboard/types.js";
import { createRunHost } from "./runHost.js";
import { FakeRecords, addFinishedCall, fakePorts, summary, type EvalHandler } from "./testSupport.js";

const OWNER = { kind: "panel" as const, objectKey: "panel-1" };
const rootEvents = (callId: string, name = "classify") => ({ callId, parentCallId: null, taskId: "t", definitionId: "d", name });

/** Follow a run to its end, collecting everything it delivered. */
function follow(host: ReturnType<typeof createRunHost>, id: string) {
  const chunks: RunChunk[] = [];
  host.watch(id, { update: (chunk) => chunks.push(chunk) });
  return {
    chunks,
    get run() {
      return chunks.at(-1)!.run;
    },
    get stdout() {
      return chunks.map((chunk) => chunk.stdout).join("");
    },
    get stderr() {
      return chunks.map((chunk) => chunk.stderr).join("");
    },
    get live() {
      return chunks.flatMap((chunk) => chunk.live);
    },
    ended: () => vi.waitFor(() => expect(chunks.at(-1)?.drained).toBe(true)),
  };
}

const classifyCall = { kind: "call" as const, function: "skills/triage/classify.nl", inputs: { ticket: "down" } };

describe("run host", () => {
  it("offers call and ask runs; a run is a cell in the panel's own eval session, under the run's id", async () => {
    const { ports, evaluated } = fakePorts({ handle: () => ({ success: true, console: "", returnValue: "urgent" }) });
    const host = createRunHost(ports);
    expect(host.kinds).toEqual(["call", "ask"]);
    const run = await host.start(classifyCall);
    const followed = follow(host, run.id);
    await followed.ended();
    expect(evaluated).toHaveLength(1);
    expect(evaluated[0]!.runId).toBe(run.id);
    expect(evaluated[0]!.source).toContain('const path = "skills/triage/classify.nl";');
    expect(run).toMatchObject({ kind: "call", status: "running", meta: { path: "skills/triage/classify.nl", inputs: { ticket: "down" } } });
    expect(followed.run).toMatchObject({ status: "done", exitCode: 0 });
    expect(followed.stdout).toBe('urgent\n');
    const ask = await host.start({ kind: "ask", instruction: "Summarize the input.", input: "hello" });
    await follow(host, ask.id).ended();
    expect(evaluated[1]!.source).toContain("nl<string>`Summarize the input.`(input)");
    await expect(host.start({ kind: "build", path: "x" })).rejects.toThrow("cannot start a build run");
    await expect(host.start({ kind: "call", function: "agent:alpha · classify" })).rejects.toThrow("needs the path of a .nl function");
  });

  it("subscribes to the run's live events before the cell starts, relays them, and ends the subscription after the last arrives", async () => {
    const records = new FakeRecords();
    const handle: EvalHandler = async (_source, { runId }) => {
      expect(records.log).toEqual([`subscribe ${JSON.stringify({ runId })}`]);
      await records.publishLive({ owner: OWNER, runId, events: [{ type: "call_start", ...rootEvents("c1") }] });
      await records.publishLive({ owner: OWNER, runId, events: [{ type: "model_delta", callId: "c1", turn: 1, delta: { type: "text", text: "ur" } }] });
      await records.publishLive({ owner: OWNER, runId, events: [{ type: "model_delta", callId: "c1", turn: 1, delta: { type: "text", text: "gent" } }] });
      await records.publishLive({ owner: OWNER, runId, events: [{ type: "call_end", ...rootEvents("c1"), outcome: "done", detail: "" }] });
      return { success: true, console: "", returnValue: "urgent" };
    };
    const { ports } = fakePorts({ records, handle });
    const host = createRunHost(ports);
    const run = await host.start(classifyCall);
    const followed = follow(host, run.id);
    await followed.ended();
    // Everything published before the run ended was delivered before the run was drained.
    expect(followed.live.map((event) => event.type)).toEqual(["call_start", "model_delta", "model_delta", "call_end"]);
    expect(followed.live.every((event) => typeof event.at === "number")).toBe(true);
    expect(records.log.at(-1)).toBe(`close ${JSON.stringify({ runId: run.id })}`);
    expect(records.subscribers.size).toBe(0);
    // A watcher that arrives later is replayed the history, with the text deltas joined.
    const late = follow(host, run.id);
    expect(late.live.filter((event) => event.type === "model_delta")).toHaveLength(1);
    expect((late.live[1] as any).delta.text).toBe("urgent");
  });

  it("fails a run with the eval failure on stderr and exit code 1, and keeps the console", async () => {
    const { ports } = fakePorts({ handle: () => ({ success: false, console: "log line", error: "classify: failed: the model gave no answer" }) });
    const host = createRunHost(ports);
    const run = await host.start(classifyCall);
    const followed = follow(host, run.id);
    await followed.ended();
    expect(followed.run).toMatchObject({ status: "failed", exitCode: 1 });
    expect(followed.stderr).toContain("log line");
    expect(followed.stderr).toContain("classify: failed: the model gave no answer");
    expect(followed.stdout).toBe("");
  });

  it("fails a run whose eval cannot be reached with that error, and does not strand its subscription", async () => {
    const records = new FakeRecords();
    const { ports } = fakePorts({ records, handle: () => Promise.reject(new Error("eval service unavailable")) });
    const host = createRunHost(ports);
    const run = await host.start(classifyCall);
    const followed = follow(host, run.id);
    await followed.ended();
    expect(followed.run.status).toBe("failed");
    expect(followed.stderr).toContain("eval service unavailable");
    expect(records.subscribers.size).toBe(0);
  });

  it("stops a run by cancelling its eval, and ends it as stopped", async () => {
    const records = new FakeRecords();
    const handle: EvalHandler = (_source, { signal }) =>
      new Promise((_resolve, reject) => signal!.addEventListener("abort", () => reject(signal!.reason ?? new Error("aborted"))));
    const { ports } = fakePorts({ records, handle });
    const host = createRunHost(ports);
    const run = await host.start(classifyCall);
    const followed = follow(host, run.id);
    expect((await host.stop(run.id)).status).toBe("stopped");
    await followed.ended();
    expect(followed.run).toMatchObject({ status: "stopped", exitCode: null });
    expect(records.subscribers.size).toBe(0);
    await expect(host.remove(run.id)).resolves.toBeUndefined();
    expect(await host.list()).toEqual([]);
  });

  it("refuses to remove a running run", async () => {
    const handle: EvalHandler = (_source, { signal }) => new Promise((_resolve, reject) => signal!.addEventListener("abort", () => reject(new Error("aborted"))));
    const { ports } = fakePorts({ handle });
    const host = createRunHost(ports);
    const run = await host.start(classifyCall);
    await expect(host.remove(run.id)).rejects.toThrow("stop the run before removing it");
    await host.stop(run.id);
  });

  it("does not start when the live subscription cannot be opened, and says why", async () => {
    const records = new FakeRecords();
    records.subscribeLive = async () => {
      throw new Error("records service unavailable");
    };
    const { ports, evaluated } = fakePorts({ records });
    await expect(createRunHost(ports).start(classifyCall)).rejects.toThrow("records service unavailable");
    expect(evaluated).toEqual([]);
  });

  it("reports a lost live stream on the run instead of waiting for events that cannot arrive", async () => {
    const records = new FakeRecords();
    const handle: EvalHandler = async () => {
      for (const subscriber of records.subscribers) subscriber.fail(new Error("stream reset"));
      return { success: true, console: "", returnValue: "ok" };
    };
    const { ports } = fakePorts({ records, handle });
    const host = createRunHost(ports);
    const run = await host.start(classifyCall);
    const followed = follow(host, run.id);
    await followed.ended();
    expect(followed.run.status).toBe("done");
    expect(followed.stderr).toContain("Live events were lost: stream reset");
  });

  it("remembers each function's last successful call for the Programs page", async () => {
    let value = "a";
    const { ports } = fakePorts({ handle: () => ({ success: true, console: "", returnValue: value }) });
    const host = createRunHost(ports);
    const first = await host.start(classifyCall);
    await follow(host, first.id).ended();
    value = "b";
    const second = await host.start({ ...classifyCall, inputs: { ticket: "later" } });
    await follow(host, second.id).ended();
    expect(host.lastCalls()["skills/triage/classify.nl"]).toMatchObject({ inputs: { ticket: "later" } });
    expect(host.running()).toEqual({ running: 0, total: 2 });
  });

  it("does not read input", async () => {
    const { ports } = fakePorts();
    await expect(createRunHost(ports).input()).rejects.toThrow("does not read input");
  });
});

describe("runs other owners made", () => {
  const agentCalls = (records: FakeRecords) => {
    records.calls = [
      summary({ call_id: "r1-a", run_id: "agent-run-1", started_at: "2026-11-01T10:00:00.000Z", outcome: "done", wall_ms: 500 }),
      summary({ call_id: "r1-b", run_id: "agent-run-1", started_at: "2026-11-01T10:00:01.000Z", definition_name: "extract", outcome: "done", wall_ms: 500 }),
      summary({ call_id: "r1-child", run_id: "agent-run-1", parent_call_id: "r1-a", started_at: "2026-11-01T10:00:00.500Z" }),
      summary({ call_id: "r2", run_id: "agent-run-2", started_at: "2026-11-01T11:00:00.000Z", outcome: "failed", agent_ref: null, owner_kind: "headless" }),
    ];
  };

  it("lists an agent's eval run as one run, with who ran it and what it called", async () => {
    const records = new FakeRecords();
    agentCalls(records);
    const { ports } = fakePorts({ records });
    const list = await createRunHost(ports).list();
    expect(list.map((run) => [run.id, run.status, run.kind])).toEqual([
      ["observed:agent-run-2", "failed", "call"],
      ["observed:agent-run-1", "done", "call"],
    ]);
    expect((list[1]!.meta as any).path).toContain("agent:alpha · classify, extract");
    expect((list[0]!.meta as any).path).toContain("headless · classify");
    expect(list[1]!.endedAt).toBe("2026-11-01T10:00:01.500Z");
  });

  it("leaves out the runs this panel started, which it lists itself", async () => {
    const records = new FakeRecords();
    const { ports } = fakePorts({ records, handle: async () => ({ success: true, console: "", returnValue: 1 }) });
    const host = createRunHost(ports);
    const run = await host.start(classifyCall);
    await follow(host, run.id).ended();
    records.calls = [summary({ call_id: "mine", run_id: run.id, owner_kind: "panel" })];
    expect((await host.list()).map((entry) => entry.id)).toEqual([run.id]);
  });

  it("follows other owners' live events only while a list is subscribed", async () => {
    const records = new FakeRecords();
    agentCalls(records);
    const { ports } = fakePorts({ records });
    const host = createRunHost(ports);
    await host.list();
    expect(records.opened).toEqual([]);
    const lists: RunRecord[][] = [];
    const stop = host.subscribe((next) => lists.push(next));
    await vi.waitFor(() => expect(records.opened).toEqual([{}]));
    stop();
    await vi.waitFor(() => expect(records.log.at(-1)).toBe("close {}"));
    expect(records.subscribers.size).toBe(0);
    // A second list subscription shares one feed, and the feed ends with the last of them.
    const first = host.subscribe(() => {});
    const second = host.subscribe(() => {});
    await vi.waitFor(() => expect(records.opened).toHaveLength(2));
    first();
    expect(records.subscribers.size).toBe(1);
    second();
    await vi.waitFor(() => expect(records.subscribers.size).toBe(0));
  });

  it("shows a run that starts and ends while the list is watched, before the service lists it", async () => {
    const records = new FakeRecords();
    const { ports } = fakePorts({ records });
    const host = createRunHost(ports);
    const lists: RunRecord[][] = [];
    const stop = host.subscribe((next) => lists.push(next));
    await vi.waitFor(() => expect(records.subscribers.size).toBe(1));
    const owner = { kind: "agent" as const, objectKey: "agent-1", agentRef: "agent:beta" };
    await records.publishLive({ owner, runId: "agent-run-9", events: [{ type: "call_start", ...rootEvents("live-1", "triage") }] });
    await vi.waitFor(() => expect(lists.at(-1)?.map((run) => [run.id, run.status])).toEqual([["observed:agent-run-9", "running"]]));
    await records.publishLive({ owner, runId: "agent-run-9", events: [{ type: "trace", ...rootEvents("live-1", "triage"), event: { kind: "model_request" } }] });
    await records.publishLive({ owner, runId: "agent-run-9", events: [{ type: "call_end", ...rootEvents("live-1", "triage"), outcome: "done", detail: "" }] });
    await vi.waitFor(() => expect(lists.at(-1)?.[0]?.status).toBe("done"));
    stop();
  });

  it("replays an agent run's recorded calls, with their traces and results, into the page", async () => {
    const records = new FakeRecords();
    addFinishedCall(records, { call_id: "r1-a", run_id: "agent-run-1", started_at: "2026-11-01T10:00:00.000Z" }, { output: "billing", events: [{ kind: "model_request", phase: "end" }, { kind: "state" }] });
    addFinishedCall(records, { call_id: "r1-child", run_id: "agent-run-1", parent_call_id: "r1-a", definition_name: "inner", started_at: "2026-11-01T10:00:00.500Z" }, { output: "x" });
    const { ports } = fakePorts({ records });
    const host = createRunHost(ports);
    const followed = follow(host, "observed:agent-run-1");
    await followed.ended();
    expect(followed.run).toMatchObject({ id: "observed:agent-run-1", status: "done" });
    expect(followed.live.map((event) => [event.type, (event as any).callId])).toEqual([
      ["call_start", "r1-a"],
      ["trace", "r1-a"],
      ["call_end", "r1-a"],
      ["call_start", "r1-child"],
      ["call_end", "r1-child"],
    ]);
    expect(followed.stdout).toBe("classify: billing\n");
    // A finished run opens no live subscription.
    expect(records.opened).toEqual([]);
  });

  it("follows a running agent run live and ends it when its calls are recorded", async () => {
    const records = new FakeRecords();
    records.calls = [summary({ call_id: "r-a", run_id: "agent-run-3", outcome: "running", wall_ms: null })];
    const { ports } = fakePorts({ records });
    const host = createRunHost(ports);
    const followed = follow(host, "observed:agent-run-3");
    await vi.waitFor(() => expect(records.opened).toEqual([{ runId: "agent-run-3" }]));
    expect(followed.run.status).toBe("running");
    await records.publishLive({ owner: OWNER, runId: "agent-run-3", events: [{ type: "model_delta", callId: "r-a", turn: 1, delta: { type: "text", text: "hi" } }] });
    await vi.waitFor(() => expect(followed.live.map((event) => event.type)).toEqual(["call_start", "model_delta"]));
    records.calls[0] = { ...records.calls[0]!, outcome: "done", wall_ms: 900 };
    await records.publishLive({ owner: OWNER, runId: "agent-run-3", events: [{ type: "call_end", ...rootEvents("r-a"), outcome: "done", detail: "" }] });
    await followed.ended();
    expect(followed.run.status).toBe("done");
  });

  it("stops following a run when the page stops watching it", async () => {
    const records = new FakeRecords();
    records.calls = [summary({ call_id: "r-a", run_id: "agent-run-3", outcome: "running", wall_ms: null })];
    const { ports } = fakePorts({ records });
    const host = createRunHost(ports);
    const chunks: RunChunk[] = [];
    const stop = host.watch("observed:agent-run-3", { update: (chunk) => chunks.push(chunk) });
    await vi.waitFor(() => expect(records.subscribers.size).toBe(1));
    stop();
    await vi.waitFor(() => expect(records.subscribers.size).toBe(0));
  });

  it("cannot stop another owner's run, hides a removed one, and reports an unknown run", async () => {
    const records = new FakeRecords();
    agentCalls(records);
    const { ports } = fakePorts({ records });
    const host = createRunHost(ports);
    await expect(host.stop("observed:agent-run-1")).rejects.toThrow("belongs to another owner");
    await host.remove("observed:agent-run-1");
    expect((await host.list()).map((run) => run.id)).toEqual(["observed:agent-run-2"]);
    const errors: Error[] = [];
    host.watch("observed:none", { update: () => {}, error: (error) => errors.push(error) });
    host.watch("not-a-run", { update: () => {}, error: (error) => errors.push(error) });
    await vi.waitFor(() => expect(errors.map((error) => error.message)).toEqual(["no run not-a-run", "no run observed:none"]));
  });

  it("tells the list's listener when the live feed cannot be opened", async () => {
    const records = new FakeRecords();
    records.subscribeLive = async () => {
      throw new Error("no live feed");
    };
    const { ports } = fakePorts({ records });
    const errors: string[] = [];
    createRunHost(ports).subscribe(() => {}, (error) => errors.push(error.message));
    await vi.waitFor(() => expect(errors).toEqual(["no live feed"]));
  });
});
