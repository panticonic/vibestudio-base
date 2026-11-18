import { sha256HexSyncText } from "@vibestudio/content-addressing";
import type { SqlStorage } from "@vibestudio/durable";
import {
  doltStorageOf,
  type DoltCapableStorage,
} from "@vibestudio/durable/dolt";
import type { StateNodeRef } from "@workspace/vcs-engine";
import {
  applyDoltWorkspaceState,
  recordDoltWorkspaceEvent,
  verifyDoltWorkspaceState,
} from "./doltWorkspaceState.js";
import {
  legacyHistoryKey,
  legacyHistoryReplay,
  legacyPlacementChange,
  type LegacyHistoryStep,
} from "./legacyHistoryReplay.js";
import { writeLegacyProvenance } from "./legacyProvenance.js";
import type { SemanticVcsStore } from "./semanticVcsStore.js";
import type { SemanticWorkspaceFacts } from "./semanticWorkspaceFacts.js";

interface ReplayTarget extends DoltCapableStorage {
  readonly sql: SqlStorage;
}

interface ReplaySource extends Pick<
  SemanticVcsStore,
  "event" | "application" | "legacyProvenance"
> {
  readonly facts: Pick<
    SemanticWorkspaceFacts,
    "entries" | "memberByStateId" | "fileStateById"
  >;
}

interface ReplayedStep {
  readonly branch: string;
  readonly hash: string;
  readonly legacyRoot: string;
}

/** Replay the frozen workspace and locate its old main and working context tips. */
export function replayLegacyWorkspace(
  source: SemanticVcsStore,
  target: ReplayTarget,
  schemaHead: string,
) {
  const { main, history, contexts } = source.legacyReplayPlan();
  const commits = replayIntoDolt(source, target, schemaHead, history);
  for (const { hash, legacyRoot } of commits.values()) {
    verifyDoltWorkspaceState(
      target.sql,
      hash,
      legacyPlacementChange(source.facts, null, legacyRoot),
    );
  }
  const headOf = (ref: StateNodeRef) => {
    const head = commits.get(legacyHistoryKey(ref));
    if (!head)
      throw new Error(
        `Legacy workspace head ${legacyHistoryKey(ref)} is missing`,
      );
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

function replayBranch(ref: StateNodeRef): string {
  return `replay/${ref.kind}/${sha256HexSyncText(legacyHistoryKey(ref))}`;
}

/** Build an offline replay graph. Semantic row writes share each placement commit. */
export function replayIntoDolt(
  source: ReplaySource,
  target: ReplayTarget,
  schemaHead: string,
  tips: Iterable<StateNodeRef>,
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
    const branch = replayBranch(ref);
    const message = `Import workspace ${branch}`;
    const { primary, secondary } = replayParents(step);
    const basis = primary ? readParent(primary) : null;
    const other = secondary ? readParent(secondary) : null;
    const start = basis?.hash ?? schemaHead;

    if (!branches.has(branch)) {
      dolt.branch.create(branch, { from: start });
      branches.add(branch);
    }
    dolt.checkout(branch);
    const head = dolt.hashOf(branch);
    if (head === start) {
      const cut = legacyPlacementChange(
        source.facts,
        other ? null : (basis?.legacyRoot ?? null),
        record.resultWorkspaceFactRootId,
      );
      const provenance = source.legacyProvenance(step);
      const write = () => {
        applyDoltWorkspaceState(target.sql, cut);
        writeLegacyProvenance(target.sql, provenance);
        if (step.kind === "event")
          recordDoltWorkspaceEvent(target.sql, step.record);
      };
      if (other) {
        const merged = dolt.merge(other.branch, {
          message,
          fastForward: false,
          resolve(merge) {
            // The old integration recorded a complete result root. Adopt that
            // placement and retain the immutable semantic rows from both sides.
            for (const conflict of merge.conflicts) {
              if (
                conflict.table !== "files" &&
                conflict.table !== "repositories"
              ) {
                throw new Error(
                  `Legacy semantic rows conflict in ${conflict.table}`,
                );
              }
              conflict.keepOurs();
            }
            target.sql.exec("DELETE FROM files");
            target.sql.exec("DELETE FROM repositories");
            write();
            for (const violation of merge.violations) {
              if (
                violation.table !== "files" &&
                violation.table !== "repositories"
              ) {
                throw new Error(
                  `Legacy semantic rows violate ${violation.table}`,
                );
              }
              violation.resolve();
            }
          },
        });
        if (merged.upToDate || merged.fastForward) {
          throw new Error(
            `Legacy integration has no distinct second parent for ${branch}`,
          );
        }
      } else {
        target.transactionSync(write, {
          commit: { message, allowEmpty: true },
        });
      }
    } else if (dolt.log({ limit: 1 })[0]?.message !== message) {
      throw new Error(
        `Unexpected commit on workspace history replay branch ${branch}`,
      );
    }
    replayed.set(legacyHistoryKey(ref), {
      branch,
      hash: dolt.hashOf(branch),
      legacyRoot: record.resultWorkspaceFactRootId,
    });
  }
  return replayed;
}

function replayParents(step: LegacyHistoryStep): {
  primary: StateNodeRef | null;
  secondary: StateNodeRef | null;
} {
  if (step.kind === "application")
    return { primary: step.record.basis, secondary: null };
  const { parentEventIds, applicationIds } = step.record;
  const lastApplication = applicationIds.at(-1);
  if (parentEventIds.length > 2)
    throw new Error("Legacy integration has too many parents");
  return {
    primary: lastApplication
      ? { kind: "application", applicationId: lastApplication }
      : parentEventIds[0]
        ? { kind: "event", eventId: parentEventIds[0] }
        : null,
    secondary: parentEventIds[1]
      ? { kind: "event", eventId: parentEventIds[1] }
      : null,
  };
}
