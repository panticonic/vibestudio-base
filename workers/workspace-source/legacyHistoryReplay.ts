import type {
  StateNodeRef,
  WorkspaceFactChangeSet,
} from "@workspace/vcs-engine";
import type {
  ApplicationRecord,
  SemanticVcsStore,
  WorkspaceEventRecord,
} from "./semanticVcsStore.js";
import type { SemanticWorkspaceFacts } from "./semanticWorkspaceFacts.js";

export type LegacyHistoryStep =
  | { readonly kind: "event"; readonly record: WorkspaceEventRecord }
  | { readonly kind: "application"; readonly record: ApplicationRecord };

/** Existing identities and tombstones survive the placement part of replay. */
export function legacyPlacementChange(
  reader: Pick<
    SemanticWorkspaceFacts,
    "entries" | "memberByStateId" | "fileStateById"
  >,
  basis: string | null,
  result: string,
): Pick<WorkspaceFactChangeSet, "repositoryUpdates" | "fileUpdates"> {
  if (basis === result) return { repositoryUpdates: [], fileUpdates: [] };
  const repositoryUpdates = changedStates("repository", (stateId) =>
    reader.memberByStateId(stateId),
  ).map(({ id, expected, result }) => ({ repositoryId: id, expected, result }));
  const fileUpdates = changedStates("file", (stateId) =>
    reader.fileStateById(stateId),
  ).map(({ id, expected, result }) => ({ fileId: id, expected, result }));
  return { repositoryUpdates, fileUpdates };

  function changedStates<T>(
    kind: "repository" | "file",
    readState: (stateId: string) => T | null,
  ): Array<{ id: string; expected: T | null; result: T }> {
    const previous = new Map(
      (basis === null ? [] : reader.entries(basis, kind)).map(
        ({ key, value }) => [key, value],
      ),
    );
    const updates = [];
    for (const { key, value } of reader.entries(result, kind)) {
      const old = previous.get(key);
      previous.delete(key);
      if (old === value) continue;
      const state = readState(value);
      const expected = old === undefined ? null : readState(old);
      if (state === null || (old !== undefined && expected === null)) {
        throw new Error(`Legacy ${kind} ${key} has a missing state`);
      }
      updates.push({ id: key, expected, result: state });
    }
    if (previous.size) {
      throw new Error(
        `Legacy ${kind} history lost a stable identity without a tombstone`,
      );
    }
    return updates;
  }
}

export function legacyHistoryKey(ref: StateNodeRef): string {
  return ref.kind === "event"
    ? `event:${ref.eventId}`
    : `application:${ref.applicationId}`;
}

/** Replay an event only after its ordered parents and its applications. */
export function* legacyHistoryReplay(
  reader: Pick<SemanticVcsStore, "event" | "application">,
  tips: Iterable<StateNodeRef>,
): Generator<LegacyHistoryStep> {
  const emitted = new Set<string>();
  const visiting = new Set<string>();
  for (const tip of tips) {
    const stack: Array<{
      readonly ref: StateNodeRef;
      readonly step?: LegacyHistoryStep;
    }> = [{ ref: tip }];
    while (stack.length) {
      const { ref, step } = stack.pop()!;
      const key = legacyHistoryKey(ref);
      if (step) {
        visiting.delete(key);
        emitted.add(key);
        yield step;
        continue;
      }
      if (emitted.has(key)) continue;
      if (visiting.has(key))
        throw new Error(`Cycle in legacy workspace history at ${key}`);
      visiting.add(key);
      if (ref.kind === "application") {
        const record = reader.application(ref.applicationId);
        if (!record) throw new Error(`Missing legacy workspace ${key}`);
        stack.push(
          { ref, step: { kind: "application", record } },
          { ref: record.basis },
        );
        continue;
      }
      const record = reader.event(ref.eventId);
      if (!record) throw new Error(`Missing legacy workspace ${key}`);
      stack.push({ ref, step: { kind: "event", record } });
      for (const applicationId of [...record.applicationIds].reverse()) {
        stack.push({ ref: { kind: "application", applicationId } });
      }
      for (const eventId of [...record.parentEventIds].reverse()) {
        stack.push({ ref: { kind: "event", eventId } });
      }
    }
  }
}
