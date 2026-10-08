import { expect, it, vi } from "vitest";
import type { MissionRecord } from "@vibestudio/automation/mission";
import { reconcileDefaultAutomationHost } from "./default-automation-host";
function fixture() {
  const values = new Map<string, string>();
  const run = vi.fn().mockResolvedValue({ runId: "durable-run" });
  const mission = {
    missionId: "updates",
    state: "active",
    charter: { execution: { kind: "agent", action: { kind: "watch" } } },
  } as MissionRecord;
  const input = {
    id: "workspace-updates",
    appVersion: "0.1.82",
    existing: false,
    events: ["app-update"],
    mission,
    read: (key: string) => values.get(key) ?? null,
    write: (key: string, value: string) => {
      values.set(key, value);
    },
    run,
  };
  return { input, run, values };
}
it("wakes an existing watch once when the surrounding app changes, preserving its charter", async () => {
  const f = fixture();
  const charter = structuredClone(f.input.mission.charter);
  await reconcileDefaultAutomationHost(f.input);
  expect(f.run).not.toHaveBeenCalled();
  f.input.existing = true;
  await reconcileDefaultAutomationHost(f.input);
  expect(f.run).not.toHaveBeenCalled();
  f.input.appVersion = "0.1.83";
  await reconcileDefaultAutomationHost(f.input);
  await reconcileDefaultAutomationHost(f.input);
  expect(f.run).toHaveBeenCalledExactlyOnceWith(
    "updates",
    "default-automation:workspace-updates:app-update:2",
  );
  expect(f.input.mission.charter).toEqual(charter);
});
it("leaves paused watches paused and never runs prompt automations on app changes", async () => {
  const f = fixture();
  f.input.existing = true;
  f.input.mission.state = "paused";
  await reconcileDefaultAutomationHost(f.input);
  expect(f.run).not.toHaveBeenCalled();
  f.input.mission.state = "active";
  f.input.appVersion = "0.1.83";
  f.input.mission.charter.execution = {
    kind: "agent",
    action: { kind: "prompt", prompt: "Work" },
  } as never;
  await reconcileDefaultAutomationHost(f.input);
  expect(f.run).not.toHaveBeenCalled();
});
it("retains the stable command identity when dispatch fails and does not record acceptance", async () => {
  const f = fixture();
  f.input.existing = true;
  f.run.mockRejectedValueOnce(new Error("Disconnected"));
  await expect(reconcileDefaultAutomationHost(f.input)).rejects.toThrow(
    "Disconnected",
  );
  expect(JSON.parse([...f.values.values()][0]!)).toMatchObject({
    accepted: false,
  });
  await reconcileDefaultAutomationHost(f.input);
  expect(f.run.mock.calls[0]).toEqual(f.run.mock.calls[1]);
});

it("does not wake unrelated default watches without an app-update subscription", async () => {
  const f = fixture();
  f.input.existing = true;
  f.input.events = [];
  await reconcileDefaultAutomationHost(f.input);
  expect(f.run).not.toHaveBeenCalled();
  expect(f.values.size).toBe(0);
});
it("treats a return to a previous app version as a new durable occurrence", async () => {
  const f = fixture();
  await reconcileDefaultAutomationHost(f.input);
  f.input.existing = true;
  f.input.appVersion = "0.1.83";
  await reconcileDefaultAutomationHost(f.input);
  f.input.appVersion = "0.1.82";
  await reconcileDefaultAutomationHost(f.input);
  expect(f.run.mock.calls.map((args) => args[1])).toEqual([
    "default-automation:workspace-updates:app-update:2",
    "default-automation:workspace-updates:app-update:3",
  ]);
});
