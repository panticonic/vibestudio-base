// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountDashboard, type MountedDashboard } from "./dashboard.js";
import { FakeRecords, addFinishedCall, fakePorts, summary } from "./testSupport.js";

const TRIAGE = "---\ndescription: Decide whether a ticket is urgent.\nargs:\n  ticket: string\nreturns: string\n---\nDecide.\n";
const description = {
  root: "skills/triage",
  services: [],
  functions: [
    {
      name: "classify",
      source: "classify.nl",
      description: "Decide whether a ticket is urgent.",
      params: ["ticket: string"],
      returns: "string",
      fields: [{ name: "ticket", type: "string", text: "string", required: true, tree: { kind: "prim", name: "string" } }],
      result: { name: "expected result", type: "string", text: "string", required: true, tree: { kind: "prim", name: "string" } },
    },
  ],
};

let root: HTMLElement;
let dashboard: MountedDashboard | undefined;

beforeEach(() => {
  root = document.body.appendChild(document.createElement("div"));
  window.location.hash = "";
});
afterEach(() => {
  dashboard?.dispose();
  dashboard = undefined;
  root.remove();
});

const mount = (options: Parameters<typeof fakePorts>[0] = {}, route?: string) => {
  const fake = fakePorts({
    files: { "skills/triage/classify.nl": TRIAGE, "skills/triage/package.json": '{"description":"Triage tickets."}' },
    handle: (source) => (source.includes("natlang.describe(\"skills/triage\")") ? { success: true, console: "", returnValue: description } : { success: true, console: "", returnValue: "urgent" }),
    ...options,
  });
  dashboard = mountDashboard(root, fake.ports, { theme: "light", ...(route ? { initialRoute: route } : {}) });
  return fake;
};
const text = () => root.textContent ?? "";
const settled = (check: () => void) => vi.waitFor(check, { timeout: 4000 });

describe("natlang dashboard", () => {
  it("offers natlang's own pages this host supports, then the executor and evaluations, and not Models or System", async () => {
    mount();
    await settled(() => expect(text()).toContain("Overview"));
    expect([...root.querySelectorAll("nav a")].map((link) => link.textContent)).toEqual([
      "Overview",
      "Programs",
      "Runs",
      "Traces",
      "Playground",
      "Executor",
      "Evaluations",
    ]);
    expect(root.classList.contains("nl-dash")).toBe(true);
  });

  it("shows the overview from the executor role, the local engine and the records store", async () => {
    const { records } = mount();
    records.calls = [summary({ call_id: "a" })];
    await settled(() => expect(text()).toContain("LFM3 1.7B"));
    await settled(() => expect(text()).toContain("1 calls"));
    expect(text()).toContain("llama.cpp b12067");
    expect(root.querySelector("#rail-model")?.textContent).toBe("executor · LFM3 1.7B (local)");
  });

  it("lists workspace programs and opens one with its typed function forms", async () => {
    mount({}, "programs");
    await settled(() => expect(text()).toContain("skills/triage"));
    await settled(() => expect(text()).toContain("Natural-language functions"));
    expect(text()).toContain("Decide whether a ticket is urgent.");
    expect(text()).toContain("classify.nl");
  });

  it("calls a function from its form: the run executes in the panel's eval session and its result shows in Runs", async () => {
    const { evaluated } = mount({}, "programs");
    await settled(() => expect(root.querySelector(".function-card")).not.toBeNull());
    const card = root.querySelector(".function-card") as HTMLDetailsElement;
    const field = card.querySelector("input, textarea") as HTMLInputElement;
    field.value = "the site is down";
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    const call = [...card.querySelectorAll("button")].find((button) => button.textContent === "Call function")!;
    call.click();
    await settled(() => expect(window.location.hash).toMatch(/^#runs-id-/));
    await settled(() => expect(text()).toContain("urgent"));
    const run = evaluated.find((entry) => entry.source.includes('const path = "skills/triage/classify.nl"'))!;
    expect(run.source).toContain('"ticket":"the site is down"');
    expect(dashboard!.page).toBe("runs");
  });

  it("shows an agent's eval run in Runs while a list is watched, and ends the live feed when the page is left", async () => {
    const { records } = mount({}, "runs");
    records.calls = [summary({ call_id: "r1", run_id: "agent-run-1" })];
    await settled(() => expect(text()).toContain("classify.nl"));
    expect(records.subscribers.size).toBe(1);
    dashboard!.navigate("overview");
    await settled(() => expect(records.subscribers.size).toBe(0));
  });

  it("lists recorded calls in Traces and opens one with its inputs and result", async () => {
    const records = new FakeRecords();
    addFinishedCall(records, { call_id: "call-1" }, { inputs: { text: "hello there" }, output: "billing" });
    mount({ records }, "traces");
    await settled(() => expect(root.querySelector("tr.click")).not.toBeNull());
    expect(text()).toContain("classify");
    (root.querySelector("tr.click") as HTMLElement).click();
    await settled(() => expect(text()).toContain("hello there"));
    expect(text()).toContain("billing");
  });

  it("follows live calls only while Traces is mounted and offers a refresh, never moving the list", async () => {
    const records = new FakeRecords();
    mount({ records }, "traces");
    await settled(() => expect(records.subscribers.size).toBe(1));
    const banner = root.querySelector("#traces-live") as HTMLElement;
    expect(banner.hidden).toBe(true);
    await records.publishLive({ owner: { kind: "agent", objectKey: "a" }, runId: "r", events: [{ type: "call_end", callId: "c", outcome: "done" }] });
    await settled(() => expect(banner.hidden).toBe(false));
    expect(banner.textContent).toContain("1 new call recorded");
    dashboard!.navigate("executor");
    await settled(() => expect(records.subscribers.size).toBe(0));
  });

  it("shows the executor role, the local model and engine, and the store, with a way to manage local models", async () => {
    const fake = mount({}, "executor");
    const open = vi.spyOn(fake.ports.localModels, "openManagement");
    await settled(() => expect(text()).toContain("Executor role"));
    expect(text()).toContain("LFM3 1.7B (local:lfm3-1.7b)");
    expect(text()).toContain("on this machine (local-models)");
    expect(text()).toContain("llama.cpp b12067 · cpu");
    expect(text()).toContain("Recorded calls");
    expect(text()).toContain("model picker in chat");
    [...root.querySelectorAll("button")].find((button) => button.textContent === "Manage local models")!.click();
    expect(open).toHaveBeenCalled();
  });

  it("says why the executor cannot run when no model fills the role", async () => {
    mount({ resolveRole: async () => ({ role: "executor", ref: null, source: "unavailable", model: null, reason: "No usable model is connected." }) }, "executor");
    await settled(() => expect(text()).toContain("No usable model is connected."));
    expect(text()).toContain("nothing fills the role");
  });

  it("shows the latest evaluation of each program with whether its gates passed", async () => {
    const records = new FakeRecords();
    records.evaluations = [
      {
        evaluationId: "e1",
        ranAt: new Date().toISOString(),
        program: "skills/triage",
        evaluation: {
          template: "base",
          suite: { id: "triage", path: "skills/triage/suite.ts", hash: "h", cases: { validation: 2 } },
          split: "validation",
          artifact: null,
          natlang: { commit: "c5740cf93405" },
          executorIdentity: { id: "gateway:local:lfm3-1.7b", configuration: { model: "local:lfm3-1.7b" } },
          summary: { quality: 0.75, cases: 2, gatesPassed: false, modelCalls: 5, meanLatencyMs: 1200 },
          cases: [{ caseId: "a", status: "scored", quality: 1 }, { caseId: "b", status: "scored", quality: 0.5 }],
          budget: {},
        },
      },
    ];
    mount({ records }, "evaluations");
    await settled(() => expect(text()).toContain("gates failed"));
    expect(text()).toContain("triage");
    expect(text()).toContain("quality 0.75");
    expect(text()).toContain("local:lfm3-1.7b");
    expect(root.querySelector("[data-evaluation='e1']")).not.toBeNull();
  });

  it("explains how an evaluation gets recorded when there is none", async () => {
    mount({}, "evaluations");
    await settled(() => expect(text()).toContain("pnpm natlang:eval"));
    expect(text()).toContain("--instance");
  });

  it("disposes the page and the shell it mounted", async () => {
    const { records } = mount({}, "traces");
    await settled(() => expect(records.subscribers.size).toBe(1));
    dashboard!.dispose();
    expect(root.childElementCount).toBe(0);
    expect(root.classList.contains("nl-dash")).toBe(false);
    await settled(() => expect(records.subscribers.size).toBe(0));
  });
});
