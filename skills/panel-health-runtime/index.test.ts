import assert from "node:assert/strict";
import { test } from "node:test";
import { bindPanelHealth } from "./index.js";

const scope = { contextId: "owned", source: "panels/owned", markerIds: ["status"] };
const observation = {
  ...scope, kind: "workspace", panelId: "panel", attemptId: "attempt",
  buildKey: "build", phase: "ready", runtimeEntityId: "renderer",
};

function fixture(panelId = observation.panelId) {
  let closes = 0;
  let opens = 0;
  const session = {
    receipt: { generation: { ...observation, panelId } },
    page: { async evaluate() { return [{ id: "status", values: ["ready"] }]; } },
    async close() { closes++; },
  } as unknown as NonNullable<Parameters<typeof bindPanelHealth>[1]["session"]>;
  const handle = {
    id: "panel",
    async diagnose() { return { observation, consoleHistory: { available: false } }; },
    async observe() { return observation; },
    cdp: { async session() { opens++; return session; } },
  } as unknown as Parameters<typeof bindPanelHealth>[0];
  return { session, handle, opened: () => opens, closed: () => closes };
}

test("health reads share a retained renderer session without closing it", async () => {
  const { handle, session, opened, closed } = fixture();
  const { markers } = await bindPanelHealth(handle, { ...scope, session }).panelHealth.observe();
  assert.deepEqual(markers, [{ id: "status", values: ["ready"] }]);
  assert.equal(opened(), 0);
  assert.equal(closed(), 0);
  await bindPanelHealth(handle, scope).panelHealth.observe();
  assert.equal(opened(), 1);
  assert.equal(closed(), 1);
});

test("a retained session must represent the exact observed renderer", async () => {
  const { handle, session, closed } = fixture("foreign");
  await assert.rejects(bindPanelHealth(handle, { ...scope, session }).panelHealth.observe(),
    /does not match the observed renderer/);
  assert.equal(closed(), 0);
});
