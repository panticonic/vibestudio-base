import type { VcsExternalSnapshot } from "@vibestudio/service-schemas/vcs";
import {
  compactId,
  type ContentDescriptor,
  type ContentMapping,
  type StateNodeRef,
} from "@workspace/vcs-engine";

type Row = Record<string, unknown>;

export interface CausalCommandRef {
  parent: {
    logId: string;
    head: string;
    invocationId: string;
  } | null;
}

export interface WorkspaceEventRecord {
  eventId: string;
  commandId: string;
  kind: "genesis" | "commit" | "integration-commit";
  parentEventIds: readonly string[];
  externalDeltaIds?: readonly string[];
  applicationIds: readonly string[];
  resultWorkspaceFactRootId: string;
  snapshotSource: WorkspaceGenesisSnapshot["source"] | null;
  message: string | null;
  createdAt: string;
}

export interface WorkUnitRecord {
  workUnitId: string;
  commandId: string;
  kind:
    | "edit"
    | "file-transfer"
    | "lifecycle"
    | "merge"
    | "revert"
    | "import"
    | "external-unapplied";
  authoredChangeIds: readonly string[];
  intentSummary: string | null;
  authorContextId: string;
  triggerEvidence: {
    text: string;
    sender: { kind: string; id: string; participantId: string | null };
  } | null;
  externalSnapshot: ExternalSnapshotRecord | null;
  contentClass: "internal" | "external";
  externalKeys: readonly string[];
  normalizationProtocol: string;
  createdAt: string;
}

export interface ExternalSnapshotRecord {
  sourceKind: VcsExternalSnapshot["sourceKind"];
  sourceUri: string;
  snapshotRevision: string;
  sourceSubdir?: string | null;
  canonicalSnapshot?: string;
  snapshotDigest: string;
  targetRepositoryIds: readonly string[];
}

export interface ChangeRecord {
  changeId: string;
  workUnitId: string;
  operation: number;
  ordinal: number;
  kind: string;
  /** Exact cross-state endpoint named by an authored copy. The change owns
   * this fact; payload conventions and parallel copy-source tables do not. */
  source: AuthoredCopySourceEndpoint | null;
  base: Row | null;
  result: Row | null;
  payload: Row;
  effectDigest: string;
}

export interface AuthoredCopySourceEndpoint {
  kind: "file";
  state: StateNodeRef;
  repositoryId: string;
  repoPath: string;
  fileId: string;
  path: string;
  contentHash: string;
  mode: number;
  contentKind: "text" | "bytes";
  byteLength: number;
  coordinateExtent: number;
}

export interface StatePredicateRecord {
  kind: string;
  [key: string]: unknown;
}

export interface AppliedChangeRecord {
  appliedChangeId: string;
  applicationId: string;
  changeId: string;
  ordinal: number;
  appliedBase: Row | null;
  appliedResult: Row | null;
  resultPredicates: readonly StatePredicateRecord[];
}

export interface ApplicationRecord {
  applicationId: string;
  workUnitId: string;
  basis: StateNodeRef;
  appliedChangeIds: readonly string[];
  resultWorkspaceFactRootId: string;
  semanticProtocol: string;
}

export type ContentOriginRef =
  | { kind: "applied-change"; appliedChangeId: string }
  | {
      kind: "file";
      state: { kind: "event"; eventId: string };
      repositoryId: string;
      fileId: string;
    };

export interface WorkspaceGenesisSnapshot {
  source: { sourceUri: string; snapshotRevision: string };
  repositories: readonly {
    repoPath: string;
    files: readonly ({
      path: string;
      contentHash: string;
      mode: number;
    } & ContentDescriptor)[];
  }[];
}

export interface ContentEdgeRecord {
  contentEdgeId: string;
  childAppliedChangeId: string;
  parent: ContentOriginRef;
  relation: "preserves" | "copies" | "incorporates";
  mappings: readonly ContentMapping[];
}

export type IntegrationDecisionRecord = {
  decisionId: string;
  targetState: StateNodeRef;
  sourceEventId: string | null;
  sourceDeltaId: string | null;
  entries: readonly {
    coordinate: { kind: "file" | "repository"; id: string };
    resolution: "adopt" | "convergent" | "composed" | "ours" | "current";
    accountedSourceChangeIds: readonly string[];
    resultChangeId: string | null;
    rationale: string | null;
  }[];
  workUnitId: string;
  createdAt: string;
};

export interface ExternalDeltaRecord {
  deltaId: string;
  workUnitId: string;
  ownerContextId: string;
  repositoryId: string;
  repoPath: string;
  targetState: StateNodeRef;
  oldSource: Row;
  newSource: Row;
  oldSnapshot: string;
  newSnapshot: string;
  inputDigest: string;
  status: "active" | "superseded" | "finalized";
  supersededByDeltaId: string | null;
  createdAt: string;
}

export interface ApplicationPersistencePlan {
  contextId: string;
  expectedWorkingHead: StateNodeRef;
  workUnit: WorkUnitRecord;
  changes: readonly ChangeRecord[];
  application: ApplicationRecord;
  appliedChanges: readonly AppliedChangeRecord[];
  contentEdges: readonly ContentEdgeRecord[];
  decisions: readonly IntegrationDecisionRecord[];
  newRepositories: readonly { repositoryId: string }[];
  newFiles: readonly {
    fileId: string;
    repositoryId: string;
    changeId: string;
  }[];
}

export interface JournalCommand {
  scopeKind: "context" | "workspace";
  scopeId: string;
  commandId: string;
  method: string;
  requestDigest: string;
  cause: CausalCommandRef;
  status: "pending" | "effect-pending" | "complete";
  result: unknown;
}

export const workUnitIdentity = (input: {
  commandId: string;
  kind: WorkUnitRecord["kind"];
  intentSummary: string | null;
  authorContextId: string;
  triggerEvidence: WorkUnitRecord["triggerEvidence"];
  externalSnapshot: WorkUnitRecord["externalSnapshot"];
  contentClass: WorkUnitRecord["contentClass"];
  externalKeys: WorkUnitRecord["externalKeys"];
}): string => compactId("work-unit", input);

export const changeIdentity = (
  input: Omit<ChangeRecord, "changeId" | "effectDigest">,
): string => compactId("change", input);

export const appliedChangeIdentity = (
  input: Omit<AppliedChangeRecord, "appliedChangeId">,
): string => compactId("applied-change", input);

export const applicationIdentity = (
  input: Omit<ApplicationRecord, "applicationId" | "appliedChangeIds"> & {
    changes: readonly Omit<
      AppliedChangeRecord,
      "appliedChangeId" | "applicationId"
    >[];
  },
): string => compactId("application", input);

export const contentEdgeIdentity = (
  input: Omit<ContentEdgeRecord, "contentEdgeId">,
): string => compactId("content-edge", input);

export const decisionIdentity = (
  input: Omit<IntegrationDecisionRecord, "decisionId">,
): string => compactId("decision", input);
