import { canonicalJson, sha256HexSyncText } from "@vibestudio/content-addressing";
import type { SqlStorage } from "@vibestudio/durable";
import { doltStorageOf, type DoltCapableStorage, type DoltStorage } from "@vibestudio/durable/dolt";
import type { StateNodeRef } from "@workspace/vcs-engine";
import {
  applyDoltWorkspaceState,
  expectedPlacementProof,
  recordDoltWorkspaceApplication,
  recordDoltWorkspaceEvent,
  verifyDoltWorkspaceState,
  workspacePlacementProof,
} from "./doltWorkspaceState.js";
import {
  legacyHistoryKey,
  legacyHistoryReplay,
  legacyPlacementChange,
  type LegacyHistoryStep,
} from "./legacyHistoryReplay.js";
import { writeLegacyProvenance, type LegacyProvenance } from "./legacyProvenance.js";
import type { SemanticVcsStore } from "./semanticVcsStore.js";
import type { SemanticWorkspaceFacts } from "./semanticWorkspaceFacts.js";

interface ReplayTarget extends DoltCapableStorage {
  readonly sql: SqlStorage;
}

interface ReplaySource extends Pick<
  SemanticVcsStore,
  "event" | "application" | "legacyProvenance"
> {
  readonly facts: Pick<SemanticWorkspaceFacts, "entries" | "memberByStateId" | "fileStateById">;
}

interface ReplayedStep {
  readonly branch: string;
  readonly hash: string;
  readonly legacyRoot: string;
}

export interface WorkspaceReplay {
  readonly main: string | null;
  readonly contexts: ReadonlyArray<{ id: string; committed: string; working: string }>;
  readonly commits: ReadonlyMap<string, ReplayedStep>;
}

/** Replay the frozen workspace and locate its old main and working context tips. */
export function replayLegacyWorkspace(
  source: SemanticVcsStore,
  target: ReplayTarget,
  schemaHead: string
): WorkspaceReplay {
  const { main, history, contexts } = source.legacyReplayPlan();
  const commits = replayIntoDolt(source, target, schemaHead, history);
  for (const { hash, legacyRoot } of commits.values()) {
    verifyDoltWorkspaceState(
      target.sql,
      hash,
      legacyPlacementChange(source.facts, null, legacyRoot)
    );
  }
  const headOf = (ref: StateNodeRef) => {
    const head = commits.get(legacyHistoryKey(ref));
    if (!head) throw new Error(`Legacy workspace head ${legacyHistoryKey(ref)} is missing`);
    return head.hash;
  };
  return {
    main: main ? headOf(main) : null,
    contexts: contexts.map(({ id, committed, working }) => ({
      id,
      committed: headOf(committed),
      working: headOf(working),
    })),
    commits,
  };
}

/** Publish a verified offline replay into its empty destination, including after a lost reply. */
export function installReplayedMain(
  target: DoltCapableStorage,
  schemaHead: string,
  replay: WorkspaceReplay
): string {
  const dolt = doltStorageOf(target);
  if (!dolt || !replay.main) throw new Error("Workspace replay has no main to install");
  const current = dolt.hashOf("main");
  if (current !== schemaHead && current !== replay.main) {
    throw new Error("Workspace main already has a different history");
  }
  dolt.checkout("main");
  if (current === replay.main) return current;
  const result = dolt.merge(replay.main, {
    resolve() {
      throw new Error("Workspace replay main does not descend from the destination schema");
    },
  });
  if (result.hash !== replay.main || !result.fastForward) {
    throw new Error("Workspace replay installation did not fast-forward to the verified commit");
  }
  return result.hash;
}

function replayBranch(ref: StateNodeRef): string {
  return `replay/${ref.kind}/${sha256HexSyncText(legacyHistoryKey(ref))}`;
}

/** Build an offline replay graph. Semantic row writes share each placement commit. */
export function replayIntoDolt(
  source: ReplaySource,
  target: ReplayTarget,
  schemaHead: string,
  tips: Iterable<StateNodeRef>
): ReadonlyMap<string, ReplayedStep> {
  const dolt = doltStorageOf(target);
  if (!dolt) throw new Error("Legacy workspace replay requires a Dolt store");
  const replayed = new Map<string, ReplayedStep>();
  const branches = new Set(dolt.branch.list().map(({ name }) => name));
  const readParent = (ref: StateNodeRef): ReplayedStep => {
    const parent = replayed.get(legacyHistoryKey(ref));
    if (!parent) throw new Error("Legacy workspace replay is missing a parent");
    return parent;
  };

  for (const step of legacyHistoryReplay(source, tips)) {
    const { record } = step;
    const ref: StateNodeRef =
      step.kind === "event"
        ? { kind: "event", eventId: step.record.eventId }
        : { kind: "application", applicationId: step.record.applicationId };
    const { primary, secondary } = replayParents(step);
    const basis = primary ? readParent(primary) : null;
    const other = secondary ? readParent(secondary) : null;
    const written = writeReplayStep(
      target,
      dolt,
      schemaHead,
      step,
      ref,
      branches,
      basis,
      other,
      () => ({
        placement: legacyPlacementChange(
          source.facts,
          other ? null : (basis?.legacyRoot ?? null),
          record.resultWorkspaceFactRootId
        ),
        provenance: source.legacyProvenance(step),
      })
    );
    replayed.set(legacyHistoryKey(ref), written);
  }
  return replayed;
}

export interface PreparedReplayStep {
  readonly step: LegacyHistoryStep;
  readonly placement: ReturnType<typeof legacyPlacementChange>;
  readonly provenance: LegacyProvenance;
  readonly placementProof: string;
}

export function prepareReplayStep(source: ReplaySource, ref: StateNodeRef): PreparedReplayStep {
  const step = readReplayStep(source, ref);
  const { primary, secondary } = replayParents(step);
  const basisRoot =
    primary && !secondary ? readReplayStep(source, primary).record.resultWorkspaceFactRootId : null;
  const resultRoot = step.record.resultWorkspaceFactRootId;
  return {
    step,
    placement: legacyPlacementChange(source.facts, basisRoot, resultRoot),
    provenance: source.legacyProvenance(step),
    placementProof: expectedPlacementProof(legacyPlacementChange(source.facts, null, resultRoot)),
  };
}

function readReplayStep(source: ReplaySource, ref: StateNodeRef): LegacyHistoryStep {
  if (ref.kind === "event") {
    const record = source.event(ref.eventId);
    if (record) return { kind: "event", record };
  } else {
    const record = source.application(ref.applicationId);
    if (record) return { kind: "application", record };
  }
  throw new Error(`Missing legacy workspace ${legacyHistoryKey(ref)}`);
}

/** Install a prepared step after its parent steps, or recover its existing commit. */
export function installPreparedReplayStep(
  target: ReplayTarget,
  schemaHead: string,
  prepared: PreparedReplayStep,
  sealed = false
): ReplayedStep {
  const dolt = doltStorageOf(target);
  if (!dolt) throw new Error("Legacy workspace replay requires a Dolt store");
  const { step } = prepared;
  const ref: StateNodeRef =
    step.kind === "event"
      ? { kind: "event", eventId: step.record.eventId }
      : { kind: "application", applicationId: step.record.applicationId };
  const branches = new Set(dolt.branch.list().map(({ name }) => name));
  const parent = (ref: StateNodeRef | null) => {
    if (!ref) return null;
    const branch = replayBranch(ref);
    if (!branches.has(branch)) throw new Error(`Missing replay parent ${legacyHistoryKey(ref)}`);
    const hash = dolt.hashOf(branch);
    const row =
      ref.kind === "event"
        ? target.sql.exec("SELECT 1 FROM dolt_at_events(?) WHERE event_id = ?", hash, ref.eventId)
        : target.sql.exec(
            "SELECT 1 FROM dolt_at_applications(?) WHERE application_id = ?",
            hash,
            ref.applicationId
          );
    if (row.toArray().length !== 1)
      throw new Error(`Replay parent ${legacyHistoryKey(ref)} is unfinished`);
    return { hash };
  };
  const { primary, secondary } = replayParents(step);
  return writeReplayStep(
    target,
    dolt,
    schemaHead,
    step,
    ref,
    branches,
    parent(primary),
    parent(secondary),
    () => {
      if (sealed) throw new Error("Workspace replay installation is closed");
      return prepared;
    },
    {
      placement: prepared.placementProof,
      input: sha256HexSyncText(canonicalJson(prepared)),
      sealed,
    }
  );
}

function writeReplayStep(
  target: ReplayTarget,
  dolt: DoltStorage,
  schemaHead: string,
  step: LegacyHistoryStep,
  ref: StateNodeRef,
  branches: Set<string>,
  basis: { hash: string } | null,
  other: { hash: string } | null,
  prepare: () => Pick<PreparedReplayStep, "placement" | "provenance">,
  proof?: { placement: string; input: string; sealed: boolean }
): ReplayedStep {
  const branch = replayBranch(ref);
  const message = `Import workspace ${branch}${proof ? ` ${proof.input}` : ""}`;
  const start = basis?.hash ?? schemaHead;
  if (!branches.has(branch)) {
    if (proof?.sealed) throw new Error("Workspace replay installation is closed");
    dolt.branch.create(branch, { from: start });
    branches.add(branch);
  }
  if (!proof?.sealed) dolt.checkout(branch);
  const head = dolt.hashOf(branch);
  if (head === start) {
    const { placement, provenance } = prepare();
    if (provenance.kind !== step.kind)
      throw new Error("Replay provenance has a different history step kind");
    const write = () => {
      applyDoltWorkspaceState(target.sql, placement);
      writeLegacyProvenance(target.sql, provenance);
      if (step.kind === "event") recordDoltWorkspaceEvent(target.sql, step.record);
      else recordDoltWorkspaceApplication(target.sql, step.record);
      assertPlacement();
    };
    if (other) {
      const merged = dolt.merge(other.hash, {
        message,
        fastForward: false,
        resolve(merge) {
          // The old integration recorded a complete result root. Adopt that
          // placement and retain the immutable semantic rows from both sides.
          for (const conflict of merge.conflicts) {
            if (conflict.table !== "files" && conflict.table !== "repositories") {
              throw new Error(`Legacy semantic rows conflict in ${conflict.table}`);
            }
            conflict.keepOurs();
          }
          target.sql.exec("DELETE FROM files");
          target.sql.exec("DELETE FROM repositories");
          write();
          for (const violation of merge.violations) {
            if (violation.table !== "files" && violation.table !== "repositories") {
              throw new Error(`Legacy semantic rows violate ${violation.table}`);
            }
            violation.resolve();
          }
        },
      });
      if (merged.upToDate || merged.fastForward) {
        throw new Error(`Legacy integration has no distinct second parent for ${branch}`);
      }
    } else {
      target.transactionSync(write, {
        commit: { message, allowEmpty: true },
      });
    }
  } else if (dolt.branch.list().find((entry) => entry.name === branch)?.message !== message) {
    throw new Error(`Unexpected commit on workspace history replay branch ${branch}`);
  }
  if (head !== start) assertPlacement(head);
  return { branch, hash: dolt.hashOf(branch), legacyRoot: step.record.resultWorkspaceFactRootId };

  function assertPlacement(at?: string) {
    if (proof && workspacePlacementProof(target.sql, at) !== proof.placement) {
      throw new Error(`Workspace replay placement proof failed for ${branch}`);
    }
  }
}

function replayParents(step: LegacyHistoryStep): {
  primary: StateNodeRef | null;
  secondary: StateNodeRef | null;
} {
  if (step.kind === "application") return { primary: step.record.basis, secondary: null };
  const { parentEventIds, applicationIds } = step.record;
  const lastApplication = applicationIds.at(-1);
  if (parentEventIds.length > 2) throw new Error("Legacy integration has too many parents");
  return {
    primary: lastApplication
      ? { kind: "application", applicationId: lastApplication }
      : parentEventIds[0]
        ? { kind: "event", eventId: parentEventIds[0] }
        : null,
    secondary: parentEventIds[1] ? { kind: "event", eventId: parentEventIds[1] } : null,
  };
}
