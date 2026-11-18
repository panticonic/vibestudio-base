import type { WorkspaceRuntime } from "@workspace/runtime/hosted";
import { assessmentSchema, snapshotSchema, checkpointMethods, ownedHandleSchema, roleSchema } from "./ownedOperationsContracts.js";
import type { z } from "zod";
import { createRpcMethods } from "@vibestudio/shared/rpcMethods";
const checkpointRpcMethods = createRpcMethods("owned-checkpoint", checkpointMethods, "");
type Handle = z.infer<typeof ownedHandleSchema>;
type Snapshot = z.infer<typeof snapshotSchema>;
type Runtime = WorkspaceRuntime["runtime"];
export type Audit = {
  opened: Array<{ handle: Handle; original: unknown }>;
  snapshots: Array<{ handle: Handle; value: Snapshot; phase: "before-restart" | "after-restart" | "before-cleanup" }>;
  restarts: Array<{ handle: Handle; before: unknown; after: unknown }>;
  retiredIds: string[]; destroyedContextIds: string[];
  remainingEntityIds: string[]; remainingContextIds: string[];
};
/** Outside-world adapter: no workflow decisions and no manufactured readiness observations. */
export function createOwnedOperations(options: {
  runtime: Pick<Runtime, "createContext" | "createEntity" | "retireEntity" | "destroyContext" | "listEntities" | "listContexts" | "supervision">;
  rpc: WorkspaceRuntime["rpc"];
}) {
  const { runtime, rpc } = options;
  const issued = new Map<string, Handle>();
  const contexts = new Set<string>();
  const retired = new Set<string>(), destroyed = new Set<string>();
  const audit: Audit = { opened: [], snapshots: [], restarts: [], retiredIds: [], destroyedContextIds: [], remainingEntityIds: [], remainingContextIds: [] };
  let closing: Promise<{ retiredIds: string[]; destroyedContextIds: string[] }> | undefined;
  const exact = (input: Handle) => {
    const handle = ownedHandleSchema.parse(input), original = issued.get(handle.id);
    if (!original || Object.keys(original).some(key => original[key as keyof Handle] !== handle[key as keyof Handle]))
      throw new Error("Use the exact handle issued to this owned workflow.");
    return original;
  };
  const freshRead = async (handle: Handle) => snapshotSchema.parse(await rpc.call(exact(handle).targetId, checkpointRpcMethods.snapshot, []));
  const inFlight = new Set<Promise<unknown>>();
  const perform = async <T>(operation: () => Promise<T>): Promise<T> => {
    if (closing) throw new Error("The owned workflow is closing; no new operations may start.");
    const work = operation(); inFlight.add(work);
    try { return await work; } finally { inFlight.delete(work); }
  };
  const close = () => closing ??= (async () => {
    await Promise.allSettled([...inFlight]);
    const errors: unknown[] = [];
    for (const handle of issued.values()) {
      if (retired.has(handle.id)) continue;
      try {
        const value = await freshRead(handle);
        audit.snapshots.push({ handle, value, phase: "before-cleanup" });
      } catch (error) { errors.push(error); }
      try { await runtime.retireEntity({ id: handle.id }); retired.add(handle.id); }
      catch (error) { errors.push(error); }
    }
    for (const contextId of contexts) {
      if (destroyed.has(contextId)) continue;
      try { await runtime.destroyContext({ contextId }); destroyed.add(contextId); }
      catch (error) { errors.push(error); }
    }
    audit.retiredIds = [...retired]; audit.destroyedContextIds = [...destroyed];
    const entities = await runtime.listEntities();
    const observedContexts = await runtime.listContexts();
    audit.remainingEntityIds = entities.filter(row => issued.has(row.id)).map(row => row.id);
    audit.remainingContextIds = observedContexts.contexts.filter(id => contexts.has(id));
    if (audit.remainingEntityIds.length || audit.remainingContextIds.length)
      errors.push(new Error("Owned resources remain after cleanup."));
    if (errors.length) throw new AggregateError(errors, "Owned cleanup or independent readback failed");
    return { retiredIds: audit.retiredIds, destroyedContextIds: audit.destroyedContextIds };
  })();
  const service = Object.freeze({
    open(role: z.infer<typeof roleSchema>): Promise<Handle> { return perform(async () => {
      roleSchema.parse(role);
      if (closing) throw new Error("The owned workflow is closing; no new resources can be opened.");
      const context = await runtime.createContext({});
      contexts.add(context.contextId);
      const original = await runtime.createEntity({ kind: "do", execution: { surface: "code", source: "workers/owned-operational-checkpoints" },
        className: "OwnedCheckpointDO", contextId: context.contextId, key: `owned-${context.contextId}-${role}` });
      if (original.contextId !== context.contextId || original.kind !== "do") throw new Error("Created worker differs from its owned context.");
      const handle: Handle = Object.freeze({ id: original.id, contextId: original.contextId, targetId: original.targetId, role });
      issued.set(handle.id, handle); audit.opened.push({ handle, original });
      await freshRead(handle);
      return handle;
    }); },
    read: (handle: Handle) => perform(() => freshRead(handle)),
    append(input: Handle, expectedRevision: number, value: z.infer<typeof assessmentSchema>) { return perform(async () => {
      const handle = exact(input), assessment = assessmentSchema.parse(value);
      if (assessment.role !== handle.role) throw new Error("Write the assessment to the worker assigned that exact role.");
      return snapshotSchema.parse(await rpc.call(handle.targetId, checkpointRpcMethods.append, [expectedRevision, assessment]));
    }); },
    restart(input: Handle) { return perform(async () => {
      const handle = exact(input), key = { kind: "do" as const, entityId: handle.id };
      const before = await runtime.supervision.describe(key);
      audit.snapshots.push({ handle, value: await freshRead(handle), phase: "before-restart" });
      await runtime.supervision.restart(key);
      const after = await runtime.supervision.describe(key);
      audit.restarts.push({ handle, before, after });
      const value = await freshRead(handle);
      audit.snapshots.push({ handle, value, phase: "after-restart" });
      return value;
    }); },
    close,
  });
  return { service, close, audit: () => structuredClone(audit) };
}
