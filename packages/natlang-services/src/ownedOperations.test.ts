import { describe, it, expect } from "vitest";
import { createOwnedOperations } from "./ownedOperations.js";
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
// Mechanism mocks only: these unit tests establish no live workflow outcomes.
function ports() {
  const contexts = new Set<string>(), entities = new Map<string, { id: string }>();
  const calls: string[] = [], entered = deferred(), activate = deferred();
  let created = 0;
  const runtime = {
    async createContext() { const contextId = `owned-test-${created++}`; contexts.add(contextId); return { contextId }; },
    async createEntity(input: { contextId: string }) {
      entered.resolve(); await activate.promise;
      const value = { id: `do:${input.contextId}`, targetId: `target:${input.contextId}`, kind: "do", contextId: input.contextId };
      entities.set(value.id, value); return value;
    },
    async retireEntity(input: { id: string }) { calls.push(`retire:${input.id}`); entities.delete(input.id); },
    async destroyContext(input: { contextId: string }) { calls.push(`destroy:${input.contextId}`); contexts.delete(input.contextId); },
    async listEntities() { return [...entities.values()]; },
    async listContexts() { return { contexts: [...contexts] }; },
    supervision: { async describe() { return [{ observed: true }]; }, async restart() { calls.push("restart"); } },
  };
  const rpc = { async call(target: string, method: { name: string }) {
    calls.push(`rpc:${target}:${method.name}`); return { revision: 0, checkpoints: [] };
  } };
  return { options: { runtime, rpc } as unknown as Parameters<typeof createOwnedOperations>[0], calls, entered, activate };
}
describe("exact owned lifecycle mechanism", () => {
  it("joins a pending launch before cleanup and admits no later work", async () => {
    const fake = ports(), owner = createOwnedOperations(fake.options);
    const opening = owner.service.open("impact");
    await fake.entered.promise;
    const closing = owner.close();
    await expect(owner.service.open("recovery")).rejects.toThrow("closing");
    expect(fake.calls).toEqual([]);
    fake.activate.resolve();
    const handle = await opening;
    const cleaned = await closing;
    expect(cleaned.retiredIds).toEqual([handle.id]);
    expect(cleaned.destroyedContextIds).toEqual([handle.contextId]);
    expect(fake.calls.indexOf(`rpc:${handle.targetId}:snapshot`)).toBeLessThan(fake.calls.indexOf(`retire:${handle.id}`));
    expect(owner.audit().remainingEntityIds).toEqual([]);
    expect(owner.audit().remainingContextIds).toEqual([]);
  });
  it("refuses altered issued handles and role-crossed writes before dispatch", async () => {
    const fake = ports(), owner = createOwnedOperations(fake.options);
    fake.activate.resolve();
    const handle = await owner.service.open("impact"), before = fake.calls.length;
    await expect(owner.service.read({ ...handle, targetId: "foreign" })).rejects.toThrow("exact handle");
    await expect(owner.service.append(handle, 0, { role: "recovery", evidenceIds: [], decision: "ready", reason: "wrong worker" })).rejects.toThrow("exact role");
    expect(fake.calls.length).toBe(before);
    await owner.close();
  });
  it("keeps the independent audit private and cleanup idempotent", async () => {
    const fake = ports(), owner = createOwnedOperations(fake.options);
    fake.activate.resolve(); await owner.service.open("impact");
    const copy = owner.audit(); copy.opened.length = 0;
    expect(owner.audit().opened.length).toBe(1);
    await owner.close(); const before = fake.calls.length;
    await owner.close(); expect(fake.calls.length).toBe(before);
    expect("audit" in owner.service).toBe(false);
  });
});
