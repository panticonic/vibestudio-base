import { canonicalJson, compareUtf16CodeUnits, sha256HexSyncText } from "@vibestudio/content-addressing";
import type { SqlStorage } from "@vibestudio/durable";
import {
  type DoltCapableStorage,
  type DoltCommitMessage,
  type DoltGrant,
  type DoltMergeOptions,
  type DoltMergeSession,
  type DoltRemoteStorage,
  type DoltRemoteTarget,
  type DoltRemoteTransport,
  doltRemotesOf,
} from "@vibestudio/durable/dolt";
import type {
  VcsBlameInput,
  VcsCompareInput,
  VcsCommitInput,
  VcsCommitResult,
  VcsCopyInput,
  VcsDiscardInput,
  VcsDiscardResult,
  VcsEditInput,
  VcsHistoryInput,
  VcsInspectInput,
  VcsImportSnapshotInput,
  VcsImportSnapshotResult,
  VcsExternalDeltaResult,
  VcsExternalDeltaLifecycleInput,
  VcsRegisterExternalDeltaInput,
  VcsListDirectoryInput,
  VcsListFilesInput,
  VcsMergeInput,
  VcsMergeResult,
  VcsMoveInput,
  VcsNeighborsInput,
  VcsReadFilesInput,
  VcsReadMemoryInput,
  VcsQueryInput,
  VcsResolveRepositoryInput,
  VcsRevertInput,
  VcsSearchInput,
  VcsSemanticNodeRef,
  VcsStatusResult,
  VcsWalkInput,
} from "@vibestudio/service-schemas/vcs";
import { vcsBlameResultSchema, vcsExternalDeltaResultSchema, vcsExternalSnapshotSchema, vcsMergeResultSchema, vcsStateNodeRefSchema } from "@vibestudio/service-schemas/vcs";
import type { HistoryQueryBasis, HistoryQueryTrajectory, HistorySearchCause, HistoryWalkCohort, HistoryWalkInvocation } from "@vibestudio/service-schemas/workspaceSource";
import { serializeByKey } from "@vibestudio/shared/keyedSerializer";
import { assertSemanticVcsPathAdmissible } from "@vibestudio/shared/vcs/pathAdmission";
import { compactId, resolveIntent, type StateNodeRef } from "@workspace/vcs-engine";
import {
  applyDoltWorkspaceState,
  committedWorkspaceEvent,
  prepareDoltEditPlacement,
  recordDoltWorkspaceApplication,
  recordDoltWorkspaceEvent,
  workspaceApplicationsAt,
  workspaceChangedLocations,
  workspaceCommitForRef,
  workspaceContentOriginsAt,
  workspaceEditBasisAt,
  workspaceFileReadsAt,
  workspaceHasFileContent,
  workspaceMergeScope,
  workspaceMergeSourcesAt,
  workspaceRepositoriesAt,
  workspaceSnapshotImportBasisAt,
  workspaceTransferBasisAt,
  type WorkspacePlacementChange,
  type WorkspaceMergeScopeEntry,
} from "./doltWorkspaceState.js";
import { readInvertedCounteractionMappings } from "./contentBlame.js";
import { workspaceRevertBasisAt } from "./doltWorkspaceRevert.js";
import { workspaceReferenceAt } from "./doltWorkspaceReferences.js";
import { workspaceCauseWalkAt, workspaceCohortSeedAt, workspaceCohortWalk, workspaceRejectionsWalk } from "./doltWorkspaceWalk.js";
import { queryUsesTrajectories, queryWorkspaceHistory } from "./doltWorkspaceQuery.js";
import { workspaceReadMemoryAt } from "./doltWorkspaceMemory.js";
import { historySearchCausesAt, searchHistoryProse } from "./doltWorkspaceSearch.js";
import { inspectWorkspaceProvenance, workspaceEventHistory, workspaceFileHistory, workspaceProvenanceNeighbors } from "./doltWorkspaceProvenance.js";
import { workspaceListDirectoryAt, workspaceListFilesAt } from "./doltWorkspaceListings.js";
import { declineHistoryFileCollisions } from "./doltPlacementConflicts.js";
import { historyMergePlacements, paginateHistoryComparison, readHistoryWorkUnitIntent, reviewHistoryMerge, reviewIntents, settledHistoryMerge } from "./doltMergeReview.js";
import { inspectExternalMerge, planExternalMerge, reviewExternalMerge, type HistoryExternalMergeSource } from "./doltExternalMerge.js";
import {
  composeHistoryText,
  historyTextMergeInputs,
  readHistoryMergeObservations,
  type HistoryMergeObservation,
  type HistoryMergeSelection,
} from "./doltTextMerge.js";
import { SemanticProvenanceWriter, stateNodeKey, validateApplicationPlan } from "./semanticProvenanceWriter.js";
import { SemanticVcsError } from "./semanticVcsErrors.js";
import type {
  ApplicationPersistencePlan,
  JournalCommand,
  WorkspaceEventRecord,
  WorkUnitRecord,
} from "./semanticHistoryRecords.js";
import { MAX_WORKING_APPLICATIONS } from "./workspaceHistoryPagination.js";
import { describeSemanticEffects, projectContentBlame, type FileContentOrigin } from "./workspaceHistoryReads.js";
import {
  importedRepositories,
  type MutationDraft,
  prepareApplication,
  editContentHashes,
  planEdit,
  planMove,
  planCopy,
  planRevert,
  planImportSnapshot,
  planExternalDeltaDraft,
} from "./workspaceMutation.js";

type ResolvingMerge = DoltMergeOptions & {
  readonly resolve: NonNullable<DoltMergeOptions["resolve"]>;
};

export interface MainMergePreview {
  head: string;
  main: string;
  base: string;
  incoming: WorkspaceMergeScopeEntry[];
  placements: ReturnType<typeof historyMergePlacements>;
  conflicts: Array<Omit<DoltMergeSession["conflicts"][number], "resolve" | "keepOurs" | "takeTheirs" | "resolved">>;
  violations: Array<Omit<DoltMergeSession["violations"][number], "resolve" | "resolved">>;
}

export interface MainPublication {
  readonly previousHead: string;
  readonly proposedHead: string;
}

export interface HistoryPublicationApproval {
  publicationId: string;
  participantId: string;
  previousEventId: string;
  proposedEventId: string;
  publication: MainPublication;
}

export interface CommittedContext {
  readonly contextId: string;
  readonly head: string;
}

export type HistoryMutationPlan =
  | { kind: "read-content"; contentHashes: string[] }
  | { kind: "committed"; head: string; result: HistoryMutationResult & { workingHead: StateNodeRef } }
  | {
      kind: "planned";
      command: HistoryCommand;
      application: HistoryApplicationPlan;
      blobs: NonNullable<MutationDraft["blobs"]>;
      result: HistoryMutationResult;
    };

export type HistoryMergeResult =
  | { kind: "read-content"; contentHashes: string[] }
  | { kind: "prepare-content"; blobs: NonNullable<MutationDraft["blobs"]> }
  | {
      kind: "committed";
      head: string;
      value: StateNodeRef;
      result: VcsMergeResult;
    };

interface HistoryMergeContent {
  observation: HistoryMergeObservation;
  contentHashes?: readonly string[];
}

type HistoryMutationResult = ReturnType<typeof prepareApplication>["result"];
export type HistoryApplicationPlan = ApplicationPersistencePlan & {
  placement: WorkspacePlacementChange | null;
};

export interface MergeSource extends CommittedContext {
  readonly participantId?: string;
}

type ScopedMergeSelection = Pick<HistoryMergeSelection, "head" | "base"> &
  ({ main: string } | { source: MergeSource });

interface HistoryDiscardReceipt {
  commandId: string;
  requestDigest: string;
  head: string;
  result: { head: string; discard: VcsDiscardResult };
}

interface HistoryReceiptStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  delete(key: string): void;
}

const PENDING_DISCARD_KEY = "history-discard-pending";
const discardReceiptKey = (id: string) => `history-discard:${sha256HexSyncText(id)}`;

type WorkspaceStorage = DoltCapableStorage & { readonly sql: SqlStorage };
export type HistoryCommand = Pick<JournalCommand, "commandId" | "method" | "requestDigest" | "cause">;
export const APPROVED_MAIN_GRANT_LIFETIME_MS = 5 * 60_000;

export interface HistoryForkRequest {
  parentContextId: string;
  childContextId: string;
  childPeer: string;
  expectedHead?: string;
}

export interface HistoryForkSeed {
  branch: string;
  head: string;
  state: StateNodeRef;
}

export function isWorkspaceRuntimeParticipant(
  participantId: string, contextId: string, runtimeId?: string,
): boolean {
  const identity: unknown = JSON.parse(participantId);
  return Array.isArray(identity) && identity.length === 3 && identity[0] === "agent" &&
    identity[2] === contextId && typeof identity[1]?.runtimeId === "string" &&
    typeof identity[1]?.authoritySessionId === "string" &&
    (runtimeId === undefined || identity[1].runtimeId === runtimeId);
}

interface HistoryForkReceipt extends HistoryForkSeed {
  completed: boolean;
}

interface HistoryForkAdoption {
  source: string;
  seed: HistoryForkSeed;
  completed: boolean;
}

function historyForkBranch(request: HistoryForkRequest): string {
  return `fork/${sha256HexSyncText(canonicalJson(request))}`;
}

function contentSourceKey(contextId: string, stateHash: string): string {
  if (!/^state:[0-9a-f]{64}$/u.test(stateHash)) throw new Error("Invalid workspace content state hash");
  return `history-content-source:${sha256HexSyncText(canonicalJson([contextId, stateHash]))}`;
}

function branchSegment(value: string): string {
  if (!value) throw new Error("Missing GAD branch identity");
  if (
    value.length <= 90 &&
    /^[A-Za-z0-9][A-Za-z0-9_.-]*$/u.test(value) &&
    !value.includes("..") &&
    !value.startsWith("id-")
  )
    return value;
  return `id-${sha256HexSyncText(value)}`;
}

export function historyRetirementBranch(participantId: string, contextId: string): string {
  return `retired/${branchSegment(participantId)}/${branchSegment(contextId)}`;
}

/** Issued by the canonical owner after it authenticates the participant. */
export function grantParticipantHistory(
  canonical: DoltRemoteStorage,
  participantId: string,
  peer?: string,
): DoltGrant {
  const participant = branchSegment(participantId);
  return canonical.remote.grant({
    label: participant,
    fetch: true,
    branches: ["main", "pub/*"],
    push: [`pub/${participant}/*`],
    ...(peer === undefined ? {} : { peer }),
  });
}

/** Run after stopping new turns and resolving the participant's committed tips. */
export async function retireParticipantHistory(
  canonical: DoltRemoteStorage,
  participantId: string,
  archive: (token: string, main: string) => Promise<void>,
  destroy: () => Promise<void>,
  peer?: string,
): Promise<void> {
  const participant = branchSegment(participantId);
  const label = `retire:${participant}`;
  for (const grant of canonical.remote.grants()) {
    if (grant.label === label) canonical.remote.revoke(grant.id);
  }
  const grant = canonical.remote.grant({
    label,
    fetch: true,
    branches: ["main"],
    push: [`retired/${participant}/*`],
    ...(peer === undefined ? {} : { peer }),
  });
  try {
    await archive(grant.token, canonical.hashOf("main"));
  } finally {
    canonical.remote.revoke(grant.id);
  }
  revokeParticipantHistory(canonical, participantId, peer);
  await destroy();
}

export function revokeParticipantHistory(canonical: DoltRemoteStorage, participantId: string, peer?: string): void {
  const participant = branchSegment(participantId);
  for (const grant of canonical.remote.grants()) {
    if (grant.label === participant || grant.label === `retire:${participant}` ||
        (peer !== undefined && grant.peer === peer)) {
      canonical.remote.revoke(grant.id);
    }
  }
}

/**
 * The canonical owner calls this after verifying the publication receipt.
 * Dolt enforces the same two heads when the grant is used by any carrier.
 */
export function grantApprovedMain(
  canonical: DoltRemoteStorage,
  publication: MainPublication,
  peer?: string,
  expiresAt = Date.now() + APPROVED_MAIN_GRANT_LIFETIME_MS,
): DoltGrant {
  return grantExactHistoryTransition(canonical, "main", publication, expiresAt, peer);
}

/** Scope a remote grant to one branch, sender, and exact pair of heads. */
export function grantExactHistoryTransition(
  canonical: DoltRemoteStorage,
  branch: string,
  publication: MainPublication,
  expiresAt: number,
  peer?: string,
  label?: string,
): DoltGrant {
  const actual = canonical.hashOf(branch);
  if (actual !== publication.previousHead) {
    throw new HistoryHeadChanged(publication.previousHead, actual);
  }
  const pushTransition = {
    previous: publication.previousHead,
    next: publication.proposedHead,
  };
  const grant = canonical.remote.grant({
    push: [branch],
    pushTransition,
    ...(label === undefined ? {} : { label }),
    expiresAt,
    ...(peer === undefined ? {} : { peer }),
  });
  if (
    grant.pushTransition?.previous !== pushTransition.previous ||
    grant.pushTransition.next !== pushTransition.next ||
    grant.expiresAt !== expiresAt
  ) {
    canonical.remote.revoke(grant.id);
    throw new Error("GAD publication requires an expiring grant for the exact Dolt push transition");
  }
  return grant;
}

export class HistoryHeadChanged extends SemanticVcsError {
  constructor(
    readonly expected: string,
    readonly actual: string,
  ) {
    super("RevisionChanged", "The workspace history head has changed", { expected, actual });
    this.name = "HistoryHeadChanged";
  }
}

/**
 * One instance per participant work cell. The queue keeps its branch and
 * grant fixed across a publication's remote reads.
 */
export class ParticipantHistory {
  readonly #participant: string;
  readonly #storage: WorkspaceStorage;
  readonly #dolt: DoltRemoteStorage;
  readonly #transport: DoltRemoteTransport;
  readonly #receipts: HistoryReceiptStore | undefined;
  #discardJournalReady = false;
  #connectedOrigin: string | undefined;
  readonly #turns = new Map<string, Promise<unknown>>();

  constructor(
    participantId: string,
    storage: WorkspaceStorage,
    transport: DoltRemoteTransport,
    receipts?: HistoryReceiptStore,
  ) {
    this.#participant = branchSegment(participantId);
    this.#storage = storage;
    const dolt = doltRemotesOf(storage);
    if (!dolt) throw new Error("GAD work cells require Dolt remotes");
    this.#dolt = dolt;
    this.#transport = transport;
    this.#receipts = receipts;
  }

  connect(origin: DoltRemoteTarget): Promise<string> {
    return this.#run(() => this.#connectOrigin(origin, this.#originIdentity(origin)));
  }

  bindContext(contextId: string, origin: DoltRemoteTarget): Promise<string> {
    return this.#run(async () => {
      const identity = this.#originIdentity(origin);
      const branch = this.#contextBranch(contextId);
      const adoption = this.#receipts?.get(`history-fork-adoption:${branch}`);
      if (adoption && !(JSON.parse(adoption) as HistoryForkAdoption).completed) {
        throw new Error("Workspace context fork has not completed");
      }
      const known = this.#dolt.branch.list().find(({ name }) => name === branch);
      if (known && this.#connectedOrigin === identity) return known.hash;
      const main = await this.#connectOrigin(origin, identity);
      return known?.hash ?? this.#openBranch(contextId, main);
    });
  }

  openContext(contextId: string, at: string): Promise<string> {
    return this.#run(() => this.#openBranch(contextId, at));
  }

  contextHeads(contextId: string) {
    return this.#run(() => {
      const workingHead = this.#dolt.hashOf(this.#contextBranch(contextId));
      const committed = committedWorkspaceEvent(this.#storage.sql, workingHead);
      if (!committed) throw new Error(`Context ${contextId} has no committed event`);
      return { workingHead, committed };
    });
  }

  workingState(contextId: string): Promise<StateNodeRef> {
    return this.#run(() => this.#contextState(contextId).state);
  }

  resolveState(contextId: string, ref: StateNodeRef): Promise<string | null> {
    return this.#run(() => this.#resolveState(contextId, ref));
  }

  materialization(contextId: string, ref: StateNodeRef) {
    return this.#run(() => {
      const commit = this.#resolveState(contextId, ref);
      if (!commit) throw new Error(`Workspace state is outside context ${contextId}`);
      return workspaceRepositoriesAt(this.#storage.sql, commit);
    });
  }

  rememberContentSource(contextId: string, stateHash: string, state: StateNodeRef): Promise<void> {
    return this.#run(() => {
      const receipts = this.#receipts;
      if (!receipts) throw new Error("Workspace build source requires local receipt storage");
      if (!this.#resolveState(contextId, state))
        throw new Error("Workspace build source is outside the caller's visible workspace history");
      const key = contentSourceKey(contextId, stateHash);
      const encoded = canonicalJson(state);
      if (receipts.get(key) !== encoded) receipts.set(key, encoded);
    });
  }

  contentSource(contextIds: readonly string[], stateHash: string) {
    return this.#run(() => {
      for (const { contextId, head } of this.#contextTips(contextIds)) {
        const stored = this.#receipts?.get(contentSourceKey(contextId, stateHash));
        if (!stored) continue;
        const state = vcsStateNodeRefSchema.parse(JSON.parse(stored));
        const commit = workspaceCommitForRef(this.#storage.sql, head, state);
        if (commit) return { state, repositories: workspaceRepositoriesAt(this.#storage.sql, commit) };
      }
      return null;
    });
  }

  readFiles(contextId: string, input: VcsReadFilesInput) {
    return this.#run(async () => {
      const commit = await this.#requireReadableState(contextId, input.state);
      return workspaceFileReadsAt(this.#storage.sql, commit, input);
    });
  }

  listFiles(contextId: string, input: VcsListFilesInput) {
    return this.#run(async () =>
      workspaceListFilesAt(this.#storage.sql, await this.#requireReadableState(contextId, input.state), input),
    );
  }

  listDirectory(contextId: string, input: VcsListDirectoryInput) {
    return this.#run(async () =>
      workspaceListDirectoryAt(this.#storage.sql, await this.#requireReadableState(contextId, input.state), input),
    );
  }

  resolveRepository(contextId: string, input: VcsResolveRepositoryInput) {
    return this.#run(async () => {
      const commit = await this.#requireReadableState(contextId, input.state);
      const repository = workspaceEditBasisAt(this.#storage.sql, commit).repositoryAtPath(input.repoPath);
      return repository ? { state: input.state, repoPath: input.repoPath, repositoryId: repository.repositoryId } : null;
    });
  }

  repositoryLocation(contextId: string, state: StateNodeRef, repositoryId: string) {
    return this.#run(async () => {
      const commit = await this.#requireReadableState(contextId, state);
      const repository = workspaceEditBasisAt(this.#storage.sql, commit).repository(repositoryId);
      return repository ? { ...repository, state } : null;
    });
  }

  changedLocations(contextId: string, target: StateNodeRef, source: StateNodeRef) {
    return this.#run(async () => {
      const before = await this.#requireReadableState(contextId, target);
      const after = await this.#requireReadableState(contextId, source);
      return { target, source, locations: workspaceChangedLocations(this.#storage.sql, before, after) };
    });
  }

  referencesReachable(contextIds: readonly string[], references: readonly VcsSemanticNodeRef[]) {
    return this.#run(async () => {
      const { sql } = this.#storage;
      const contexts = this.#contextTips(contextIds);
      const tips = [...new Set(contexts.map(({ head }) => head))];
      if (tips.length === 0) return false;
      const unresolved = references.filter((ref) =>
        !tips.some((tip) => workspaceReferenceAt(sql, tip, ref)) &&
        !contexts.some(({ contextId }) => this.#externalTipFor(contextId, ref) !== null),
      );
      if (unresolved.length === 0) return true;
      const main = await this.#fetchMain();
      return !tips.includes(main) && unresolved.every((ref) => workspaceReferenceAt(sql, main, ref));
    });
  }

  contextForReference(contextIds: readonly string[], ref: VcsSemanticNodeRef): Promise<string | null> {
    return this.#run(() => {
      const { sql } = this.#storage;
      return this.#contextTips(contextIds)
        .find(({ head, contextId }) => workspaceReferenceAt(sql, head, ref) ||
          this.#externalTipFor(contextId, ref) !== null)?.contextId ?? null;
    });
  }

  #contextTips(contextIds: readonly string[]): Array<{ contextId: string; head: string }> {
    const branches = new Map(this.#dolt.branch.list().map(({ name, hash }) => [name, hash]));
    return contextIds.flatMap((contextId) => {
      const branch = `ctx/${branchSegment(contextId)}`;
      const head = branches.get(branch);
      return head && !this.#receipts?.get(`history-retired:${branch}`) ? [{ contextId, head }] : [];
    });
  }

  inspect(contextId: string, workspaceId: string, input: VcsInspectInput) {
    return this.#run(async () => {
      const at = await this.#provenanceTip(contextId, input.node);
      return inspectWorkspaceProvenance(this.#storage.sql, at, workspaceId, input.node, input.edgeLimit);
    });
  }

  neighbors(contextId: string, workspaceId: string, input: VcsNeighborsInput) {
    return this.#run(async () => {
      const at = await this.#provenanceTip(contextId, input.root);
      return workspaceProvenanceNeighbors(this.#storage.sql, at, workspaceId, contextId, input);
    });
  }

  history(contextId: string, workspaceId: string, input: VcsHistoryInput) {
    return this.#run(async () => {
      const { root } = input;
      if (root.kind === "file") {
        const at = await this.#provenanceTip(contextId, root);
        return workspaceFileHistory(this.#storage.sql, at, workspaceId, contextId, { ...input, root, direction: "past" });
      }
      const tips = input.direction === "past"
        ? [await this.#provenanceTip(contextId, root)]
        : [...new Set([this.#dolt.hashOf(this.#contextBranch(contextId)), await this.#fetchMain()])];
      return workspaceEventHistory(this.#storage.sql, tips, workspaceId, contextId, { ...input, root });
    });
  }

  async #admittedHistoryRevisions(input: { contextId: string; visibilityContextIds?: string[] | undefined }, protectedEventId: string) {
    const main = await this.#fetchMain();
    const protectedRevision = workspaceCommitForRef(this.#storage.sql, main, { kind: "event", eventId: protectedEventId });
    if (!protectedRevision)
      throw new SemanticVcsError("InvalidReference", "Workspace has no protected main revision");
    const own = this.#dolt.hashOf(this.#contextBranch(input.contextId));
    const others = this.#contextTips(input.visibilityContextIds ?? []).map(({ head }) => head);
    return [...new Set([own, ...others, protectedRevision])];
  }

  search(input: VcsSearchInput, protectedEventId: string) {
    return this.#run(async () => {
      const revisions = await this.#admittedHistoryRevisions(input, protectedEventId);
      return { ...searchHistoryProse(this.#storage.sql, revisions, input), revisions };
    });
  }

  walk(workspaceId: string, input: VcsWalkInput, protectedEventId: string) {
    return this.#run(async () => {
      const revisions = await this.#admittedHistoryRevisions(input, protectedEventId);
      const { sql } = this.#storage;
      const at = revisions.find((tip) => workspaceReferenceAt(sql, tip, input.subject)) ?? null;
      if (input.walk === "cohort") {
        const seed = workspaceCohortSeedAt(sql, at, workspaceId, input);
        if (seed?.kind === "turn" || seed?.kind === "invocation")
          return { kind: "cohort" as const, seed, revisions };
        const page = workspaceCohortWalk(sql, revisions, input, seed, []);
        return { kind: "page" as const, page, revisions, invocation: null };
      }
      if (!at)
        throw new SemanticVcsError("InvalidReference", "Workspace walk subject is outside the admitted history");
      if (input.walk === "rejections") {
        const page = workspaceRejectionsWalk(sql, at, revisions, workspaceId, input);
        return { kind: "page" as const, page, revisions, invocation: null };
      }
      const { invocation, ...page } = workspaceCauseWalkAt(sql, at, workspaceId, input);
      return { kind: "page" as const, page, revisions, invocation };
    });
  }

  walkCohort(input: VcsWalkInput, revisions: string[], seed: HistoryWalkCohort, invocations: HistoryWalkInvocation[]) {
    return this.#run(() => workspaceCohortWalk(this.#storage.sql, revisions, input, seed, invocations));
  }

  queryBasis(input: VcsQueryInput, protectedEventId: string): Promise<HistoryQueryBasis> {
    return this.#run(async () => {
      const revisions = await this.#admittedHistoryRevisions(input, protectedEventId);
      return {
        revisions, state: this.#stateAt(revisions[0]!).state,
        needsTrajectory: queryUsesTrajectories(input),
      };
    });
  }

  recallBasis(contextId: string, protectedEventId: string) {
    return this.#run(() => this.#admittedHistoryRevisions({ contextId }, protectedEventId));
  }

  query(input: VcsQueryInput, basis: HistoryQueryBasis, trajectory: HistoryQueryTrajectory) {
    return this.#run(() => queryWorkspaceHistory(
      this.#storage.sql, this.#dolt, input, basis.state, basis.revisions, trajectory,
    ));
  }

  searchCausesAt(revision: string, after: HistorySearchCause | null) {
    return this.#run(() => historySearchCausesAt(this.#storage.sql, revision, after));
  }

  blame(contextId: string, input: VcsBlameInput) {
    return this.#run(async () => {
      const revision = await this.#requireReadableState(contextId, input.state);
      const { sql } = this.#storage;
      const file = workspaceEditBasisAt(sql, revision).file(input.fileId);
      if (!file || file.repositoryId !== input.repositoryId)
        throw new SemanticVcsError("InvalidReference", `Unknown file ${input.fileId}`);
      return vcsBlameResultSchema.parse(projectContentBlame({
        sql, revision, input, file,
        readOrigin: () => workspaceContentOriginsAt(sql, revision, [input.fileId]).get(input.fileId)?.ref,
        intentTier: (id) => readHistoryWorkUnitIntent(sql, revision, id).tier,
      }));
    });
  }

  readMemory(workspaceId: string, input: VcsReadMemoryInput) {
    return this.#run(() => {
      const { head, state } = this.#contextState(input.contextId);
      return workspaceReadMemoryAt(this.#storage.sql, head, workspaceId, state, input);
    });
  }

  async #provenanceTip(contextId: string, node: VcsSemanticNodeRef): Promise<string> {
    const { sql } = this.#storage;
    const local = this.#dolt.hashOf(this.#contextBranch(contextId));
    const external = this.#externalTipFor(contextId, node);
    if (external !== null) return external;
    if (workspaceReferenceAt(sql, local, node)) return local;
    const main = await this.#fetchMain();
    if (!workspaceReferenceAt(sql, main, node))
      throw new SemanticVcsError("InvalidReference", "Workspace provenance is outside the admitted history");
    return main;
  }

  projection(contextId: string) {
    return this.#run(() => {
      const { head, state } = this.#contextState(contextId);
      return { head, state, repositories: workspaceRepositoriesAt(this.#storage.sql, head) };
    });
  }

  status(contextId: string): Promise<VcsStatusResult> {
    return this.#run<VcsStatusResult>(async () => {
      const { sql } = this.#storage;
      const { head, saved, state, applications } = this.#contextState(contextId);
      const main = await this.#fetchMain();
      const mainEvent = committedWorkspaceEvent(sql, main);
      if (mainEvent?.head !== main) {
        throw new SemanticVcsError("IntegrityFailure", "Workspace main has no exact saved event");
      }
      const base = this.#mergeBase(main, saved.head);
      const mainRelation = main === saved.head ? "at"
        : base === main ? "ahead"
        : base === saved.head ? "behind"
        : "diverged";
      const counts = applications.length === 0 ? { work_units: 0, changes: 0 } : sql.exec(
        `SELECT COUNT(DISTINCT app.work_unit_id) AS work_units, COUNT(applied.applied_change_id) AS changes
           FROM dolt_at_applications(?1) AS app
           JOIN json_each(?2) AS selected ON selected.value = app.application_id
           LEFT JOIN dolt_at_gad_applied_changes(?1) AS applied USING (application_id)`,
        head,
        JSON.stringify(applications),
      ).toArray()[0];
      const workUnits = counts?.["work_units"];
      const changes = counts?.["changes"];
      if (typeof workUnits !== "number" || typeof changes !== "number") {
        throw new SemanticVcsError("IntegrityFailure", "Workspace has invalid working counts");
      }
      const sources = applications.length === 0 ? { eventIds: [], deltaIds: [] }
        : workspaceMergeSourcesAt(sql, head, saved.head, applications);
      const integrating = [
        ...sources.eventIds.map((eventId) => ({ kind: "event" as const, eventId })),
        ...sources.deltaIds.map((deltaId) => ({ kind: "external-delta" as const, deltaId })),
      ];
      return {
        contextId,
        committed: { kind: "event", eventId: saved.eventId },
        workingHead: state,
        clean: saved.head === head,
        mainEventId: mainEvent.eventId,
        mainRelation,
        workingCounts: { applications: applications.length, workUnits, changes },
        integrating: integrating.map((source) => {
          const pending = source.kind === "external-delta" ? this.#pendingExternal(contextId, state, source.deltaId) : [];
          const conflicts = pending.filter(({ structural, aspects }) => structural || aspects.some(({ status }) => status === "conflict")).length;
          return { source, remainingCoordinateCount: pending.length, mergeableCoordinateCount: pending.length - conflicts,
            conflictCoordinateCount: conflicts, concluded: true, asOfWorkingHead: state,
            stale: pending.some(({ textCandidate }) => textCandidate !== null) };
        }),
      };
    });
  }

  #contextState(contextId: string) {
    return this.#stateAt(this.#dolt.hashOf(this.#contextBranch(contextId)));
  }

  #stateAt(head: string) {
    const { sql } = this.#storage;
    const saved = committedWorkspaceEvent(sql, head);
    if (!saved) throw new SemanticVcsError("IntegrityFailure", "Workspace context has no saved event");
    const applications = saved.head === head ? [] : workspaceApplicationsAt(sql, head, saved.head);
    if (applications.length > MAX_WORKING_APPLICATIONS) {
      throw new SemanticVcsError("ScopeTooLarge", "Workspace has too many working applications");
    }
    let state: StateNodeRef = { kind: "event", eventId: saved.eventId };
    if (saved.head !== head) {
      const applicationId = applications.at(-1);
      if (!applicationId) {
        throw new SemanticVcsError("IntegrationIncomplete", "Workspace head has no semantic application");
      }
      state = { kind: "application", applicationId };
      if (workspaceCommitForRef(sql, head, state) !== head) {
        throw new SemanticVcsError("IntegrationIncomplete", "Workspace head has no exact semantic state");
      }
    }
    return { head, saved, applications, state };
  }

  hasFileContent(contextId: string, contentHash: string): Promise<boolean> {
    return this.#run(() => {
      const name = `ctx/${branchSegment(contextId)}`;
      if (this.#receipts?.get(`history-retired:${name}`)) return false;
      const branch = this.#dolt.branch.list().find((candidate) => candidate.name === name);
      return branch !== undefined &&
        workspaceHasFileContent(this.#storage.sql, branch.hash, contentHash);
    });
  }

  contentOrigins(contextId: string, ref: StateNodeRef, fileIds: readonly string[]) {
    return this.#run(async () => {
      const commit = await this.#resolveReadableState(contextId, ref);
      if (!commit) throw new Error(`Workspace state is outside context ${contextId}`);
      return workspaceContentOriginsAt(this.#storage.sql, commit, fileIds);
    });
  }

  planEdit(
    head: string,
    edit: VcsEditInput,
    command: HistoryCommand,
    receipt: Record<string, unknown> | null,
    triggerEvidence: WorkUnitRecord["triggerEvidence"] = null,
  ): Promise<HistoryMutationPlan> {
    return this.#run<HistoryMutationPlan>(async () => {
      if (command.commandId !== edit.commandId || command.method !== "edit") {
        throw new SemanticVcsError("IntegrityFailure", "Workspace edit and command differ");
      }
      const current = this.#dolt.hashOf(this.#contextBranch(edit.contextId));
      if (this.#hasCommand(current, edit.contextId, command)) {
        return this.#committedMutation(current, edit.contextId, command.commandId);
      }
      if (current !== head) throw new HistoryHeadChanged(head, current);
      const { sql } = this.#storage;
      if (workspaceCommitForRef(sql, head, edit.expectedWorkingHead) !== head) {
        throw new SemanticVcsError(
          "RevisionChanged",
          "Workspace edit names a different working revision",
        );
      }
      const basis = workspaceEditBasisAt(sql, head);
      if (receipt === null) {
        const contentHashes = editContentHashes(edit, basis);
        if (contentHashes.length > 0) return { kind: "read-content", contentHashes };
      }
      const draft = planEdit(edit, receipt, basis);
      return this.#prepareMutation(head, edit, command, draft, triggerEvidence);
    });
  }

  planTransfer(
    head: string,
    transfer: { method: "move"; value: VcsMoveInput } | { method: "copy"; value: VcsCopyInput },
    cause: HistoryCommand["cause"],
    triggerEvidence: WorkUnitRecord["triggerEvidence"] = null,
    readableContextIds: readonly string[] = [],
  ): Promise<HistoryMutationPlan> {
    return this.#run(async () => {
      const { value, method } = transfer;
      const { contextId, commandId, expectedWorkingHead } = value;
      const command = { commandId, method, requestDigest: compactId(`${method}-request`, value), cause };
      const current = this.#dolt.hashOf(this.#contextBranch(contextId));
      if (this.#hasCommand(current, contextId, command)) {
        return this.#committedMutation(current, contextId, commandId);
      }
      if (current !== head) throw new HistoryHeadChanged(head, current);
      const { sql } = this.#storage;
      if (workspaceCommitForRef(sql, head, expectedWorkingHead) !== head) {
        throw new SemanticVcsError("RevisionChanged", "Workspace transfer names a different working revision");
      }
      const target = workspaceTransferBasisAt(sql, head);
      if (transfer.method === "move") {
        return this.#prepareMutation(head, value, command, planMove(transfer.value, target), triggerEvidence);
      }
      const sources = new Map<string, { head: string; basis: ReturnType<typeof workspaceTransferBasisAt> }>();
      const basis = stateNodeKey(expectedWorkingHead);
      for (const { source } of transfer.value.copies) {
        const key = stateNodeKey(source.state);
        if (!sources.has(key)) {
          const at = key === basis
            ? head : await this.#requireReadableState(contextId, source.state, readableContextIds);
          sources.set(key, { head: at, basis: workspaceTransferBasisAt(sql, at) });
        }
      }
      const draft = planCopy(transfer.value, target, (state) => {
        const source = sources.get(stateNodeKey(state));
        if (!source) throw new SemanticVcsError("IntegrityFailure", "Workspace copy lost its source revision");
        return source.basis;
      });
      return this.#prepareMutation(head, value, command, draft, triggerEvidence, sources);
    });
  }

  planRevert(
    head: string,
    revert: VcsRevertInput,
    cause: HistoryCommand["cause"],
    triggerEvidence: WorkUnitRecord["triggerEvidence"] = null,
  ): Promise<HistoryMutationPlan> {
    return this.#run<HistoryMutationPlan>(() => {
      const { contextId, commandId, expectedWorkingHead } = revert;
      const command = { commandId, method: "revert", requestDigest: compactId("revert-request", revert), cause };
      const current = this.#dolt.hashOf(this.#contextBranch(contextId));
      if (this.#hasCommand(current, contextId, command)) {
        return this.#committedMutation(current, contextId, commandId);
      }
      if (current !== head) throw new HistoryHeadChanged(head, current);
      const { sql } = this.#storage;
      if (workspaceCommitForRef(sql, head, expectedWorkingHead) !== head) {
        throw new SemanticVcsError("RevisionChanged", "Workspace revert names a different working revision");
      }
      const draft = planRevert(revert, workspaceRevertBasisAt(sql, head));
      return this.#prepareMutation(head, revert, command, draft, triggerEvidence);
    });
  }

  async #prepareMutation(
    head: string,
    input: { contextId: string; expectedWorkingHead: StateNodeRef },
    command: HistoryCommand,
    draft: MutationDraft,
    triggerEvidence: WorkUnitRecord["triggerEvidence"],
    sourceRevisions?: ReadonlyMap<string, { head: string }>,
    evidenceKeys: readonly string[] = [],
  ): Promise<Extract<HistoryMutationPlan, { kind: "planned" }>> {
    const { contextId, expectedWorkingHead } = input;
    const basisKey = stateNodeKey(expectedWorkingHead);
    const needed = new Map<string, { state: StateNodeRef; files: Set<string> }>();
    for (const { source, base } of draft.changes) {
      const prior = base?.["kind"] === "file" && typeof base["contentHash"] === "string" ? base["fileId"] : null;
      const fileId = source?.fileId ?? prior;
      if (typeof fileId !== "string") continue;
      const state = source?.state ?? expectedWorkingHead;
      const key = stateNodeKey(state);
      const selection = needed.get(key);
      if (selection) selection.files.add(fileId);
      else needed.set(key, { state, files: new Set([fileId]) });
    }
    const originsAt = new Map<string, Map<string, FileContentOrigin>>();
    for (const [key, { state, files }] of needed) {
      const at = key === basisKey
        ? head : sourceRevisions?.get(key)?.head ?? await this.#requireReadableState(contextId, state);
      const origins = workspaceContentOriginsAt(this.#storage.sql, at, [...files]);
      for (const fileId of files) {
        if (!origins.has(fileId))
          throw new SemanticVcsError("IntegrityFailure", `File ${fileId} has no content origin`);
      }
      originsAt.set(key, origins);
    }
    const origins = [...originsAt.values()].flatMap((entries) => [...entries.values()]);
    const externalKeys = [...new Set([
      ...evidenceKeys,
      ...origins.flatMap((origin) => origin.externalKeys),
      ...(draft.externalSnapshot
        ? [`repo:${draft.externalSnapshot.sourceUri}@${draft.externalSnapshot.snapshotRevision}`]
        : []),
    ])].sort(compareUtf16CodeUnits);
    if (externalKeys.length > 256) {
      throw new SemanticVcsError(
        "ScopeTooLarge",
        "A semantic mutation cannot persist more than 256 external lineage keys",
      );
    }
    const prepared = prepareApplication(input, draft, command.commandId, {
      now: () => new Date().toISOString(),
      workUnitEvidence: () => ({ authorContextId: contextId, triggerEvidence }),
      contentIntegrity: () => ({
        class: draft.externalSnapshot || evidenceKeys.length > 0 || origins.some((origin) => origin.contentClass === "external")
          ? "external" : "internal",
        externalKeys,
        contentOrigins: new Map(),
      }),
      contentOrigins: (state, selected) => {
        const exact = originsAt.get(stateNodeKey(state));
        return new Map(selected.flatMap((id) => {
          const origin = exact?.get(id);
          return origin ? [[id, origin] as const] : [];
        }));
      },
      invertedCounteractions: (ids, child, parent) =>
        readInvertedCounteractionMappings(this.#storage.sql, ids, child, parent, head),
      preparePlacement: (files, repositories) => prepareDoltEditPlacement(head, files, repositories),
    });
    return {
      kind: "planned",
      command,
      application: { ...prepared.plan, placement: prepared.placement },
      blobs: draft.blobs ?? [],
      result: prepared.result,
    };
  }

  #applicationForCommand(at: string, commandId: string) {
    const { sql } = this.#storage;
    const rows = sql.exec(
      `SELECT app.application_id, app.work_unit_id
         FROM dolt_at_applications(?1) AS app
         JOIN dolt_at_gad_work_units(?1) AS work USING (work_unit_id)
        WHERE work.command_id = ?2 LIMIT 2`,
      at,
      commandId,
    ).toArray();
    const { application_id: applicationId, work_unit_id: workUnitId } = rows[0] ?? {};
    if (rows.length !== 1 || typeof applicationId !== "string" || typeof workUnitId !== "string") {
      throw new SemanticVcsError("IntegrityFailure", "Recorded workspace command has no unique application");
    }
    const workingHead = { kind: "application" as const, applicationId };
    const head = workspaceCommitForRef(sql, at, workingHead);
    if (!head) throw new SemanticVcsError("IntegrityFailure", "Recorded workspace application has no commit");
    return { workingHead, workUnitId, head };
  }

  #committedMutation(
    at: string,
    contextId: string,
    commandId: string,
    merge = false,
  ): Extract<HistoryMutationPlan, { kind: "committed" }> {
    const { sql } = this.#storage;
    const { workingHead, workUnitId, head } = this.#applicationForCommand(at, commandId);
    const changes = sql.exec(
      `SELECT change_id FROM dolt_at_gad_changes(?)
        WHERE work_unit_id = ? ORDER BY operation, ordinal`,
      head,
      workUnitId,
    ).toArray();
    const incorporated = merge ? sql.exec(
      `SELECT applied.change_id
         FROM dolt_at_gad_applied_changes(?1) AS applied
         JOIN dolt_at_gad_changes(?1) AS authored USING (change_id)
        WHERE applied.application_id = ?2 AND authored.work_unit_id <> ?3
        ORDER BY applied.ordinal`,
      head,
      workingHead.applicationId,
      workUnitId,
    ).toArray() : [];
    const decisions = merge ? sql.exec(
      `SELECT decision_id FROM dolt_at_gad_integration_decisions(?) WHERE work_unit_id = ?`,
      head,
      workUnitId,
    ).toArray() : [];
    return {
      kind: "committed",
      head,
      result: {
        commandId,
        contextId,
        workingHead,
        workUnitId,
        applicationId: workingHead.applicationId,
        changeCount: changes.length,
        changeIds: changes.slice(0, 200).map((row) => String(row["change_id"])),
        incorporatedChangeCount: incorporated.length,
        incorporatedChangeIds: incorporated.slice(0, 200).map((row) => String(row["change_id"])),
        decisionIds: decisions.map((row) => String(row["decision_id"])),
      },
    };
  }

  forkContext(parentId: string, expectedHead: string, childId: string): Promise<string> {
    return this.#run(() => {
      this.#assertHead(this.#contextBranch(parentId), expectedHead);
      return this.#openBranch(childId, expectedHead);
    });
  }

  /** Capture the first selected frontier and expose it to one storage peer. */
  offerContextFork(request: HistoryForkRequest, local: boolean) {
    return this.#run(() => {
      const journal = this.#receipts;
      if (!journal) throw new Error("Workspace fork requires local receipt storage");
      const branch = historyForkBranch(request);
      const key = `history-fork-offer:${branch}`;
      const stored = journal.get(key);
      let receipt: HistoryForkReceipt;
      if (stored === null) {
        const { head, state } = this.#contextState(request.parentContextId);
        if (request.expectedHead !== undefined && request.expectedHead !== head)
          throw new HistoryHeadChanged(request.expectedHead, head);
        receipt = { branch, head, state, completed: false };
        journal.set(key, canonicalJson(receipt));
      } else {
        receipt = JSON.parse(stored) as HistoryForkReceipt;
      }
      const { completed, ...seed } = receipt;
      if (completed) {
        this.#removeForkOffer(branch);
        return { seed, grant: null };
      }
      if (!this.#dolt.branch.list().some(({ name }) => name === branch)) {
        this.#dolt.branch.create(branch, { from: seed.head });
      }
      this.#assertHead(branch, seed.head);
      if (local) return { seed, grant: null };
      const grant = this.#dolt.remote.grant({
        fetch: true, label: branch, branches: [branch], peer: request.childPeer,
      });
      for (const prior of this.#dolt.remote.grants()) {
        if (prior.label === branch && prior.id !== grant.id) this.#dolt.remote.revoke(prior.id);
      }
      return { seed, grant };
    });
  }

  finishContextFork(request: HistoryForkRequest, seed: HistoryForkSeed): Promise<void> {
    return this.#run(() => {
      const journal = this.#receipts;
      const branch = historyForkBranch(request);
      const key = `history-fork-offer:${branch}`;
      const stored = journal?.get(key);
      if (!journal || stored == null)
        throw new Error("Workspace fork has no recorded source");
      const { completed, ...recorded } = JSON.parse(stored) as HistoryForkReceipt;
      if (canonicalJson(recorded) !== canonicalJson(seed))
        throw new Error("Workspace fork acknowledged a different source");
      if (!completed) journal.set(key, canonicalJson({ ...recorded, completed: true }));
      this.#removeForkOffer(branch);
    });
  }

  #removeForkOffer(branch: string): void {
    for (const grant of this.#dolt.remote.grants()) {
      if (grant.label === branch) this.#dolt.remote.revoke(grant.id);
    }
    if (this.#dolt.branch.list().some(({ name }) => name === branch)) {
      this.#dolt.branch.delete(branch, { force: true });
    }
  }

  adoptContextFork(input: {
    request: HistoryForkRequest;
    seed: HistoryForkSeed;
    source: string;
    origin: DoltRemoteTarget | null;
    transport: DoltRemoteTransport;
    local: boolean;
  }): Promise<HistoryForkSeed> {
    return this.#run(async () => {
      const { request, seed, source, origin, transport, local } = input;
      const journal = this.#receipts;
      if (!journal) throw new Error("Workspace fork requires local receipt storage");
      if (seed.branch !== historyForkBranch(request))
        throw new Error("Workspace fork named a different target");
      const contextBranch = this.#contextBranch(request.childContextId);
      const key = `history-fork-adoption:${contextBranch}`;
      const expected = { source, seed };
      const stored = journal.get(key);
      const prior = stored === null ? null : JSON.parse(stored) as HistoryForkAdoption;
      if (prior && canonicalJson({ source: prior.source, seed: prior.seed }) !== canonicalJson(expected))
        throw new Error("Workspace fork target is already assigned");
      const existing = this.#dolt.branch.list().find(({ name }) => name === contextBranch);
      const remote = `fork-${seed.branch.slice(-59)}`;
      if (prior?.completed) {
        if (!existing) throw new Error("Workspace fork lost its working branch");
        if (this.#dolt.remote.list().some(({ name }) => name === remote)) this.#dolt.remote.remove(remote);
        return seed;
      }
      if (existing && (!prior || existing.hash !== seed.head))
        throw new Error("Workspace fork target already has a working branch");
      if (!prior) {
        try {
          if (!local) {
            if (!origin) throw new Error("Workspace fork is missing its transfer grant");
            this.#configureRemote(remote, origin);
            const result = await this.#dolt.fetch(remote, { branches: [seed.branch], transport });
            if (result.branches[seed.branch] !== seed.head)
              throw new Error("Workspace fork fetched a different source");
          }
          if (workspaceCommitForRef(this.#storage.sql, seed.head, seed.state) !== seed.head)
            throw new Error("Workspace fork has a different semantic revision");
          journal.set(key, canonicalJson({ ...expected, completed: false }));
        } catch (error) {
          if (this.#dolt.remote.list().some(({ name }) => name === remote)) this.#dolt.remote.remove(remote);
          throw error;
        }
      }
      this.#openBranch(request.childContextId, seed.head);
      journal.set(key, canonicalJson({ ...expected, completed: true }));
      if (this.#dolt.remote.list().some(({ name }) => name === remote)) this.#dolt.remote.remove(remote);
      return seed;
    });
  }

  discard(contextId: string, expectedHead: string, committedHead: string): Promise<string> {
    return this.#run(() => {
      const branch = this.#contextBranch(contextId);
      this.#assertHead(branch, expectedHead);
      if (committedHead !== this.#mergeBase(branch, committedHead)) {
        throw new Error(`Committed tip is outside context ${contextId}`);
      }
      if (this.#dolt.branch.current() !== branch) this.#dolt.checkout(branch);
      return this.#dolt.reset({ hard: true, to: committedHead });
    });
  }

  hasDiscardReceipt(input: VcsDiscardInput, cause: HistoryCommand["cause"]): Promise<boolean> {
    return this.#run(() => this.#discardReceipt(input, cause) !== null);
  }

  #discardReceipt(input: VcsDiscardInput, cause: HistoryCommand["cause"]): HistoryDiscardReceipt | null {
    const stored = this.#receipts?.get(discardReceiptKey(input.commandId));
    if (stored == null) return null;
    const receipt = JSON.parse(stored) as HistoryDiscardReceipt;
    // Receipts created before public routing included the original physical head.
    const digest = compactId("discard-request", { input, cause });
    const priorDigest = compactId("discard-request", { head: receipt.head, input, cause });
    if (receipt.requestDigest !== digest && receipt.requestDigest !== priorDigest) {
      throw new SemanticVcsError("CommandIdReuse", "Workspace discard command has changed");
    }
    return receipt;
  }

  /** Discard only the selected unsaved applications and keep the exact retry receipt. */
  discardWorkingContext(
    head: string,
    input: VcsDiscardInput,
    cause: HistoryCommand["cause"],
  ): Promise<HistoryDiscardReceipt["result"]> {
    return this.#run(() => {
      const journal = this.#receipts;
      if (!journal) throw new Error("Workspace discard requires local receipt storage");
      const { commandId, contextId } = input;
      const requestDigest = compactId("discard-request", { input, cause });
      const prior = this.#discardReceipt(input, cause);
      if (prior) return prior.result;
      const working = this.#contextState(contextId);
      if (working.head !== head) throw new HistoryHeadChanged(head, working.head);
      if (stateNodeKey(input.expectedWorkingHead) !== stateNodeKey(working.state)) {
        throw new SemanticVcsError("RevisionChanged", "Workspace discard names a different working revision");
      }
      this.#hasCommand(head, contextId, { commandId, cause, method: "discard", requestDigest });
      const receipt: HistoryDiscardReceipt = {
        commandId, requestDigest, head,
        result: {
          head: working.saved.head,
          discard: {
            contextId,
            workingHead: { kind: "event", eventId: working.saved.eventId },
            discardedApplicationIds: working.applications,
          },
        },
      };
      this.#discardJournalReady = false;
      journal.set(PENDING_DISCARD_KEY, canonicalJson(receipt));
      this.#restoreDiscard();
      return receipt.result;
    });
  }

  #restoreDiscard(): void {
    const journal = this.#receipts;
    if (!journal || this.#discardJournalReady) return;
    const stored = journal.get(PENDING_DISCARD_KEY);
    if (stored !== null) {
      const receipt = JSON.parse(stored) as HistoryDiscardReceipt;
      const { head, discard } = receipt.result;
      const current = this.#dolt.hashOf(this.#contextBranch(discard.contextId));
      if (current !== head) {
        this.#checkoutExpected(discard.contextId, receipt.head);
        if (this.#dolt.reset({ hard: true, to: head }) !== head) {
          throw new Error("Workspace discard did not recover its saved revision");
        }
      }
      this.#storage.transactionSync(() => {
        journal.set(discardReceiptKey(receipt.commandId), stored);
        journal.delete(PENDING_DISCARD_KEY);
      });
    }
    this.#discardJournalReady = true;
  }

  commit<T>(
    contextId: string,
    expectedHead: string,
    message: DoltCommitMessage,
    write: () => T
  ): Promise<{ readonly value: T; readonly head: string }> {
    return this.#run(() => this.#commit(contextId, expectedHead, message, write));
  }

  /** Persist one prepared semantic mutation atomically with its placement and provenance. */
  applyApplication(
    expectedHead: string,
    command: HistoryCommand,
    plan: HistoryApplicationPlan
  ): Promise<{ readonly value: StateNodeRef; readonly head: string }> {
    const { contextId, application, workUnit } = plan;
    const value = { kind: "application" as const, applicationId: application.applicationId };
    return this.#run(() => {
      if (workUnit.kind === "merge") {
        throw new SemanticVcsError("IntegrityFailure", "Workspace integration requires a native merge");
      }
      if (command.commandId !== workUnit.commandId || workUnit.authorContextId !== contextId) {
        throw new SemanticVcsError(
          "IntegrityFailure",
          "Prepared command ownership differs from the work unit"
        );
      }
      const current = this.#dolt.hashOf(this.#contextBranch(contextId));
      if (this.#hasCommand(current, contextId, command)) {
        return this.#applicationReceipt(current, command, value);
      }
      return this.#commit(contextId, expectedHead, `Workspace ${command.method}`, () => {
        this.#writePreparedApplication(expectedHead, command, plan);
        return value;
      });
    });
  }

  #writePreparedApplication(expectedHead: string, command: HistoryCommand, plan: HistoryApplicationPlan): void {
    const { sql } = this.#storage;
    validateApplicationPlan(plan);
    if (
      stateNodeKey(plan.expectedWorkingHead) !== stateNodeKey(plan.application.basis) ||
      workspaceCommitForRef(sql, expectedHead, plan.application.basis) !== expectedHead
    ) {
      throw new SemanticVcsError("RevisionChanged", "Prepared workspace revision has changed");
    }
    if (plan.placement === undefined) {
      throw new SemanticVcsError("IntegrityFailure", "Prepared workspace placement is missing");
    }
    if (plan.placement !== null) applyDoltWorkspaceState(sql, plan.placement);
    this.#recordCommand(plan.contextId, command, plan.workUnit.createdAt);
    this.#persistApplication(plan);
  }

  /** Stage the application and its save off the live branch, then fast-forward once. */
  importSnapshot(
    expectedHead: string,
    input: VcsImportSnapshotInput,
    observation: Record<string, unknown>,
    cause: HistoryCommand["cause"],
    triggerEvidence: WorkUnitRecord["triggerEvidence"] = null,
  ): Promise<{ head: string; result: VcsImportSnapshotResult }> {
    return this.#run(async () => {
      const { sql } = this.#storage;
      const { contextId, commandId, expectedWorkingHead } = input;
      const command = { commandId, method: "importSnapshot", requestDigest: compactId("importSnapshot-request", input), cause };
      const branch = this.#contextBranch(contextId);
      const stage = `import/${branchSegment(contextId)}/${sha256HexSyncText(canonicalJson(command))}`;
      const current = this.#dolt.hashOf(branch);
      let staged = this.#dolt.branch.list().find(({ name }) => name === stage)?.hash;
      if (this.#hasCommand(current, contextId, command)) {
        const receipt = this.#importReceipt(current, input);
        if (staged) this.#removeImportBranch(stage);
        return receipt;
      }
      if (current !== expectedHead) throw new HistoryHeadChanged(expectedHead, current);
      const parent = committedWorkspaceEvent(sql, current);
      if (expectedWorkingHead.kind !== "event" || parent?.head !== current || parent.eventId !== expectedWorkingHead.eventId) {
        if (staged) this.#removeImportBranch(stage);
        throw new SemanticVcsError("RevisionChanged", "Snapshot import requires the exact saved context");
      }
      if (!staged || !this.#hasCommand(staged, contextId, command)) {
        if (staged && staged !== current)
          throw new SemanticVcsError("IntegrityFailure", "Snapshot staging changed its expected basis");
        const { draft } = planImportSnapshot(input, observation, workspaceSnapshotImportBasisAt(sql, current));
        const prepared = await this.#prepareMutation(current, input, command, draft, triggerEvidence);
        if (!staged) this.#dolt.branch.create(stage, { from: current });
        staged = this.#commitBranch(stage, "Import workspace snapshot", () =>
          this.#writePreparedApplication(current, command, prepared.application)
        ).head;
      }
      if (committedWorkspaceEvent(sql, staged)?.head !== staged) {
        const applicationIds = workspaceApplicationsAt(sql, staged, current);
        if (applicationIds.length !== 1)
          throw new SemanticVcsError("IntegrityFailure", "Snapshot staging has no exact application");
        const message = input.message ?? `Import ${input.source.kind === "git" ? input.source.commit : input.source.snapshotRevision}`;
        const fields = {
          commandId, kind: "commit" as const, parentEventIds: [parent.eventId], externalDeltaIds: [],
          applicationIds, resultWorkspaceFactRootId: staged, message, createdAt: new Date().toISOString(),
        };
        staged = this.#commitBranch(stage, message, () => recordDoltWorkspaceEvent(sql, {
          ...fields, eventId: compactId("workspace-event", fields), snapshotSource: null,
        })).head;
      }
      const receipt = this.#importReceipt(staged, input);
      if (receipt.head !== staged)
        throw new SemanticVcsError("IntegrityFailure", "Snapshot staging has a different saved revision");
      this.#checkoutExpected(contextId, current);
      const applied = this.#dolt.merge(staged, {
        resolve() { throw new Error("Snapshot import did not descend from the verified working revision"); },
      });
      if (!applied.fastForward || applied.hash !== staged)
        throw new SemanticVcsError("IntegrityFailure", "Snapshot import did not fast-forward its exact working revision");
      this.#removeImportBranch(stage);
      return receipt;
    });
  }

  /** Register sealed external evidence without advancing the participant's working revision. */
  registerExternalDelta(
    expectedHead: string,
    input: VcsRegisterExternalDeltaInput,
    observation: Record<string, unknown>,
    cause: HistoryCommand["cause"],
    triggerEvidence: WorkUnitRecord["triggerEvidence"] = null,
  ): Promise<VcsExternalDeltaResult> {
    return this.#run(() => {
      const { sql } = this.#storage;
      const { contextId, commandId, repositoryId, repoPath, expectedWorkingHead } = input;
      const receipts = this.#receipts;
      if (!receipts) throw new Error("External delta registration requires local receipt storage");
      const receiptKey = `history-external-register:${sha256HexSyncText(canonicalJson([contextId, commandId]))}`;
      const command = { commandId, method: "registerExternalDelta", requestDigest: compactId("registerExternalDelta-request", input), cause };
      const current = this.#dolt.hashOf(this.#contextBranch(contextId));
      const stage = this.#externalBranch(contextId);
      const staged = this.#dolt.branch.list().find(({ name }) => name === stage)?.hash;
      const deltaId = compactId("external-delta:v1", {
        ownerContextId: contextId, repositoryId,
        oldSnapshot: input.oldSource.snapshot, newSnapshot: input.newSource.snapshot,
      });
      const matchingStage = staged !== undefined && this.#hasCommand(staged, contextId, command);
      const recordedResponse = matchingStage ? receipts.get(receiptKey) : null;
      if (recordedResponse !== null) return vcsExternalDeltaResultSchema.parse(JSON.parse(recordedResponse));
      if (this.#hasCommand(current, contextId, command)) {
        const prior = this.#externalDelta(current, contextId, deltaId);
        if (!prior) throw new SemanticVcsError("IntegrityFailure", "Replayed external delta has no retained draft");
        return prior.result;
      }
      if (matchingStage) throw new SemanticVcsError("IntegrityFailure", "External delta receipt has no recorded response");
      if (current !== expectedHead) throw new HistoryHeadChanged(expectedHead, current);
      if (workspaceCommitForRef(sql, current, expectedWorkingHead) !== current) {
        throw new SemanticVcsError("RevisionChanged", "External delta requires the exact working revision");
      }
      const repository = workspaceEditBasisAt(sql, current).repositoryAtPath(repoPath);
      if (repository?.repositoryId !== repositoryId) {
        throw new SemanticVcsError("InvalidReference", `External delta target ${repositoryId} is not ${repoPath}`);
      }
      const placed = new Map(sql.exec(
        `SELECT file_id, path FROM dolt_at_files(?) WHERE repository_id = ? AND presence = 'placed'`,
        current, repositoryId,
      ).toArray().map(({ file_id, path }) => [String(path), String(file_id)]));
      for (const file of [...input.oldFiles, ...input.newFiles]) assertSemanticVcsPathAdmissible(file.path);
      const { record, workUnit, changes } = planExternalDeltaDraft(input, observation, {
        fileIdAtPath: (path) => placed.get(path) ?? null,
        evidence: () => ({ authorContextId: contextId, triggerEvidence }),
        now: () => new Date().toISOString(),
      });
      const prior = this.#externalDelta(staged ?? current, contextId, deltaId);
      if (prior && prior.inputDigest !== record.inputDigest) {
        throw new SemanticVcsError("IntegrityFailure", `External delta ${deltaId} was re-registered with different evidence`);
      }
      if (!prior && input.supersedesDeltaId) {
        const superseded = this.#externalDelta(staged ?? current, contextId, input.supersedesDeltaId);
        if (!superseded || superseded.result.status !== "active") {
          throw new SemanticVcsError("InvalidReference", "External delta to supersede is not active in this context");
        }
      }
      if (!staged) this.#dolt.branch.create(stage, { from: current });
      const result: VcsExternalDeltaResult = prior?.result ?? {
        deltaId, workUnitId: workUnit.workUnitId, repositoryId, repoPath,
        oldSnapshot: record.oldSnapshot, newSnapshot: record.newSnapshot, status: "active",
        changeCount: changes.length, changeIds: changes.slice(0, 200).map(({ changeId }) => changeId),
      };
      this.#commitBranch(stage, "Register external workspace delta", () => {
        if (!prior) {
          const provenance = new SemanticProvenanceWriter(sql);
          provenance.persistWorkUnit(workUnit, resolveIntent({
            stated: workUnit.intentSummary,
            trigger: triggerEvidence && { text: triggerEvidence.text, sender: triggerEvidence.sender.id },
            mechanical: describeSemanticEffects(workUnit.kind, changes),
          }));
          provenance.persistChanges(changes);
          provenance.persistExternalDelta(record);
          if (input.supersedesDeltaId) {
            sql.exec(
              `UPDATE gad_external_deltas SET status = 'superseded', superseded_by_delta_id = ?
                WHERE delta_id = ? AND owner_context_id = ? AND status = 'active'`,
              deltaId, input.supersedesDeltaId, contextId,
            );
          }
        }
        this.#recordCommand(contextId, command, workUnit.createdAt);
        receipts.set(receiptKey, canonicalJson(result));
      });
      return result;
    });
  }

  #externalBranch(contextId: string): string {
    return `external/${branchSegment(contextId)}`;
  }

  setExternalDeltaStatus(
    expectedHead: string,
    input: VcsExternalDeltaLifecycleInput,
    cause: HistoryCommand["cause"],
    status: "superseded" | "finalized",
  ): Promise<VcsExternalDeltaResult> {
    return this.#run(() => {
      const { contextId, commandId, deltaId, expectedWorkingHead } = input;
      const current = this.#dolt.hashOf(this.#contextBranch(contextId));
      const stage = this.#externalBranch(contextId);
      const staged = this.#dolt.branch.list().find(({ name }) => name === stage)?.hash;
      const method = status === "superseded" ? "supersedeExternalDelta" : "finalizeExternalDelta";
      const command = { commandId, method, requestDigest: compactId(`${method}-request`, input), cause };
      if (staged && this.#hasCommand(staged, contextId, command)) {
        const prior = this.#externalDelta(staged, contextId, deltaId);
        if (prior?.result.status !== status) {
          throw new SemanticVcsError("IntegrityFailure", "External delta lifecycle command has no recorded response");
        }
        return prior.result;
      }
      const replayed = this.#hasCommand(current, contextId, command);
      const { sql } = this.#storage;
      if (!replayed && current !== expectedHead) throw new HistoryHeadChanged(expectedHead, current);
      if (!replayed && workspaceCommitForRef(sql, current, expectedWorkingHead) !== current) {
        throw new SemanticVcsError("RevisionChanged", "External delta lifecycle command requires the exact working revision");
      }
      if (replayed) {
        const prior = this.#externalDelta(current, contextId, deltaId);
        if (prior?.result.status !== status) {
          throw new SemanticVcsError("IntegrityFailure", "Replayed external delta command has no recorded response");
        }
        return prior.result;
      }
      const prior = this.#externalDelta(staged ?? current, contextId, deltaId);
      if (!prior || (prior.result.status !== "active" && prior.result.status !== status)) {
        throw new SemanticVcsError("InvalidReference", "External delta cannot change status in this context");
      }
      if (status === "finalized" && prior.result.status === "active") {
        const pending = this.#pendingExternal(contextId, expectedWorkingHead, deltaId);
        if (pending.length) {
          throw new SemanticVcsError("IntegrationIncomplete", "External delta still has undecided changes", {
            source: { kind: "external-delta", deltaId },
            unaccountedCoordinates: pending.slice(0, 500).map(({ id }) => ({ kind: "file", id })),
          });
        }
      }
      if (!staged) this.#dolt.branch.create(stage, { from: current });
      this.#commitBranch(stage, "Conclude external workspace delta", () => {
        if (prior.result.status === "active") {
          sql.exec(
            `UPDATE gad_external_deltas SET status = ?
              WHERE delta_id = ? AND owner_context_id = ? AND status = 'active'`,
            status, deltaId, contextId,
          );
        }
        this.#recordCommand(contextId, command, new Date().toISOString());
      });
      return { ...prior.result, status };
    });
  }

  #externalTipFor(contextId: string, ref: VcsSemanticNodeRef): string | null {
    if (ref.kind !== "external-delta" && ref.kind !== "work-unit" && ref.kind !== "change" && ref.kind !== "command") return null;
    const stage = this.#externalBranch(contextId);
    const tip = this.#dolt.branch.list().find(({ name }) => name === stage)?.hash;
    if (!tip) return null;
    const { sql } = this.#storage;
    const lookup = ref.kind === "external-delta"
      ? [`SELECT 1 FROM dolt_at_gad_external_deltas(?) WHERE owner_context_id = ? AND delta_id = ?`, tip, contextId, ref.deltaId] as const
      : ref.kind === "work-unit"
        ? [`SELECT 1 FROM dolt_at_gad_external_deltas(?) WHERE owner_context_id = ? AND work_unit_id = ?`, tip, contextId, ref.workUnitId] as const
        : ref.kind === "change"
          ? [`SELECT 1 FROM dolt_at_gad_external_deltas(?) AS delta
               JOIN dolt_at_gad_changes(?) AS change USING (work_unit_id)
              WHERE delta.owner_context_id = ? AND change.change_id = ?`, tip, tip, contextId, ref.changeId] as const
          : [`SELECT 1 FROM dolt_at_commands(?) WHERE scope_kind = 'context' AND scope_id = ?
               AND command_id = ? AND method IN ('registerExternalDelta', 'supersedeExternalDelta', 'finalizeExternalDelta')`, tip, contextId, ref.commandId] as const;
    return sql.exec(lookup[0], ...lookup.slice(1)).toArray().length === 1 ? tip : null;
  }

  #externalDelta(at: string, contextId: string, deltaId: string): {
    inputDigest: string;
    target: StateNodeRef;
    result: VcsExternalDeltaResult;
  } | null {
    const { sql } = this.#storage;
    const delta = sql.exec(
      `SELECT * FROM dolt_at_gad_external_deltas(?)
        WHERE delta_id = ? AND owner_context_id = ?`,
      at, deltaId, contextId,
    ).toArray()[0];
    if (!delta) return null;
    const workUnitId = String(delta["work_unit_id"]);
    const changes = sql.exec(
      `SELECT change_id FROM dolt_at_gad_changes(?)
        WHERE work_unit_id = ? ORDER BY operation, ordinal, change_id`,
      at, workUnitId,
    ).toArray();
    return {
      inputDigest: String(delta["input_digest"]),
      target: vcsStateNodeRefSchema.parse(delta["target_state_kind"] === "event"
        ? { kind: "event", eventId: delta["target_state_id"] }
        : { kind: "application", applicationId: delta["target_state_id"] }),
      result: {
        deltaId, workUnitId, repositoryId: String(delta["repository_id"]), repoPath: String(delta["repo_path"]),
        oldSnapshot: String(delta["old_snapshot"]), newSnapshot: String(delta["new_snapshot"]),
        status: delta["status"] as VcsExternalDeltaResult["status"],
        changeCount: changes.length, changeIds: changes.slice(0, 200).map(({ change_id }) => String(change_id)),
      },
    };
  }

  #externalMergeSource(contextId: string, target: StateNodeRef, deltaId: string, requireCurrent = true): HistoryExternalMergeSource {
    const current = this.#dolt.hashOf(this.#contextBranch(contextId));
    const head = workspaceCommitForRef(this.#storage.sql, current, target);
    if (!head || (requireCurrent && head !== current)) {
      throw new SemanticVcsError("RevisionChanged", "External comparison requires the exact working revision");
    }
    const draft = this.#externalTipFor(contextId, { kind: "external-delta", deltaId }) ?? head;
    const delta = this.#externalDelta(draft, contextId, deltaId);
    if (!delta) throw new SemanticVcsError("InvalidReference", "External delta is unavailable in this context");
    return { head, draft, delta: delta.result, base: delta.target };
  }

  #pendingExternal(contextId: string, target: StateNodeRef, deltaId: string) {
    const source = this.#externalMergeSource(contextId, target, deltaId);
    const { entries, decisions } = inspectExternalMerge(this.#storage.sql, source);
    return entries.filter(({ id, structural, aspects }) => !decisions.has(id) &&
      (structural || aspects.some(({ status }) => status === "adopt" || status === "conflict")));
  }

  #importReceipt(at: string, input: VcsImportSnapshotInput) {
    const { sql } = this.#storage;
    const saved = this.#committedSave(at, input.contextId, input.commandId);
    const { result } = this.#committedMutation(at, input.contextId, input.commandId);
    if (canonicalJson(saved.result.committedApplicationIds) !== canonicalJson([result.applicationId]))
      throw new SemanticVcsError("IntegrityFailure", "Saved snapshot names a different application");
    const stored = sql.exec(
      "SELECT external_snapshot_json FROM dolt_at_gad_work_units(?) WHERE work_unit_id = ? AND kind = 'import'",
      saved.head, result.workUnitId,
    ).toArray()[0]?.["external_snapshot_json"];
    if (typeof stored !== "string")
      throw new SemanticVcsError("IntegrityFailure", "Saved snapshot has no import provenance");
    const externalSnapshot = vcsExternalSnapshotSchema.parse(JSON.parse(stored));
    const importedRepositoryIds = importedRepositories(input).map(({ repositoryId }) => repositoryId);
    if (canonicalJson([...new Set(importedRepositoryIds)].sort(compareUtf16CodeUnits)) !==
        canonicalJson(externalSnapshot.targetRepositoryIds)) {
      throw new SemanticVcsError("IntegrityFailure", "Saved snapshot names different repository identities");
    }
    return {
      head: saved.head,
      result: {
        contextId: input.contextId, eventId: saved.result.event.eventId,
        workUnitId: result.workUnitId, applicationId: result.applicationId,
        externalSnapshot, importedRepositoryIds,
      },
    };
  }

  #removeImportBranch(branch: string): void {
    if (this.#dolt.branch.current() === branch) this.#dolt.checkout("main");
    this.#dolt.branch.delete(branch, { force: true });
  }

  #applicationReceipt(
    at: string,
    command: HistoryCommand,
    value: { kind: "application"; applicationId: string },
  ) {
    const { sql } = this.#storage;
    const head = workspaceCommitForRef(sql, at, value);
    if (!head)
      throw new SemanticVcsError("CommandIdReuse", "Prepared command has a different application");
    const rows = sql.exec(
      `SELECT 1 FROM dolt_at_applications(?) app
       JOIN dolt_at_gad_work_units(?) work USING (work_unit_id)
       WHERE app.application_id = ? AND work.command_id = ?`,
      head,
      head,
      value.applicationId,
      command.commandId,
    ).toArray();
    if (rows.length !== 1)
      throw new SemanticVcsError("CommandIdReuse", "Application belongs to a different command");
    return { value, head };
  }

  #persistApplication(plan: HistoryApplicationPlan): void {
    const { sql } = this.#storage;
    const provenance = new SemanticProvenanceWriter(sql);
    const work = plan.workUnit;
    const trigger = work.triggerEvidence;
    const changes = [...plan.changes].sort((left, right) =>
      left.operation - right.operation || left.ordinal - right.ordinal ||
      compareUtf16CodeUnits(left.changeId, right.changeId),
    );
    const intent = resolveIntent({
      stated: work.intentSummary,
      trigger: trigger && { text: trigger.text, sender: trigger.sender.id },
      mechanical: describeSemanticEffects(work.kind, changes),
    });
    provenance.persistWorkUnit(work, intent);
    provenance.persistChanges(plan.changes);
    provenance.persistAppliedChanges(plan.appliedChanges);
    for (const edge of plan.contentEdges) provenance.persistContentEdge(edge);
    for (const decision of plan.decisions) provenance.persistDecision(decision);
    recordDoltWorkspaceApplication(sql, plan.application);
  }

  /** Save the participant's exact working applications without changing placements. */
  saveContext(
    expectedHead: string,
    input: VcsCommitInput,
    cause: HistoryCommand["cause"],
  ): Promise<{ head: string; result: VcsCommitResult }> {
    return this.#run(() => {
      const { sql } = this.#storage;
      const { commandId, contextId } = input;
      const command = { commandId, method: "commit", requestDigest: compactId("commit-request", input), cause };
      const current = this.#dolt.hashOf(this.#contextBranch(contextId));
      if (this.#hasCommand(current, contextId, command)) {
        return this.#committedSave(current, contextId, commandId);
      }
      if (current !== expectedHead) throw new HistoryHeadChanged(expectedHead, current);

      const parent = committedWorkspaceEvent(sql, current);
      if (!parent) throw new SemanticVcsError("IntegrityFailure", "Workspace context has no saved event");
      const applicationIds = workspaceApplicationsAt(sql, current, parent.head);
      if (applicationIds.length > MAX_WORKING_APPLICATIONS) {
        throw new SemanticVcsError("ScopeTooLarge", "Workspace has too many working applications to save");
      }
      if (input.concludes?.kind === "event") {
        throw new SemanticVcsError("IntegrationIncomplete", "Workspace integration needs a completed decision");
      }
      const installation = input.templateInstallation;
      if (applicationIds.length === 0 && !installation) {
        throw new SemanticVcsError("RevisionChanged", "Nothing is working");
      }
      const expected = input.expectedWorkingHead;
      const expectedTip = applicationIds.length
        ? expected.kind === "application" && applicationIds.at(-1) === expected.applicationId
        : expected.kind === "event" && parent.eventId === expected.eventId;
      if (!expectedTip || workspaceCommitForRef(sql, current, expected) !== current) {
        throw new SemanticVcsError("RevisionChanged", "Workspace save names a different working revision");
      }
      const sources = workspaceMergeSourcesAt(sql, current, parent.head, applicationIds);
      if (input.concludes?.kind === "external-delta" && !sources.deltaIds.includes(input.concludes.deltaId)) {
        throw new SemanticVcsError("IntegrationIncomplete", "Workspace integration needs a recorded external decision");
      }
      for (const deltaId of sources.deltaIds) {
        const pending = this.#pendingExternal(contextId, expected, deltaId);
        if (pending.length) throw new SemanticVcsError("IntegrationIncomplete", "Workspace has an incomplete external delta", {
          source: { kind: "external-delta", deltaId },
          unaccountedCoordinates: pending.slice(0, 500).map(({ id }) => ({ kind: "file", id })),
        });
      }
      const kind: WorkspaceEventRecord["kind"] = sources.eventIds.length + sources.deltaIds.length > 0 ? "integration-commit" : "commit";
      const fields = {
        commandId,
        kind,
        parentEventIds: [parent.eventId, ...sources.eventIds],
        externalDeltaIds: sources.deltaIds,
        applicationIds,
        resultWorkspaceFactRootId: current,
        message: input.message ?? null,
        createdAt: new Date().toISOString(),
      };
      const event: WorkspaceEventRecord = {
        ...fields,
        eventId: compactId("workspace-event", installation ? { ...fields, installation } : fields),
        snapshotSource: null,
      };
      const result = this.#saveResult(contextId, event.eventId, applicationIds, sources);
      const { head } = this.#commit(contextId, expectedHead, input.message ?? "Save workspace revision", () => {
        this.#recordCommand(contextId, command, event.createdAt);
        recordDoltWorkspaceEvent(sql, event);
        if (installation) {
          sql.exec(
            "INSERT INTO workspace_template_installations (event_id, installation_json) VALUES (?, ?)",
            event.eventId, canonicalJson(installation),
          );
        }
        sources.deltaIds.forEach((deltaId, ordinal) => sql.exec(
          "INSERT INTO gad_workspace_event_external_sources (event_id, ordinal, delta_id) VALUES (?, ?, ?)",
          event.eventId, ordinal, deltaId,
        ));
      });
      return { head, result };
    });
  }

  #committedSave(at: string, contextId: string, commandId: string): { head: string; result: VcsCommitResult } {
    const { sql } = this.#storage;
    const rows = sql.exec(
      `SELECT event_id, kind FROM dolt_at_events(?)
        WHERE command_id = ? AND kind IN ('commit', 'integration-commit') LIMIT 2`,
      at,
      commandId,
    ).toArray();
    const eventId = rows[0]?.["event_id"];
    if (rows.length !== 1 || typeof eventId !== "string") {
      throw new SemanticVcsError("IntegrityFailure", "Recorded save has no unique workspace event");
    }
    const head = workspaceCommitForRef(sql, at, { kind: "event", eventId });
    if (!head) throw new SemanticVcsError("IntegrityFailure", "Recorded save has no commit");
    const working = sql.exec(
      `SELECT parent_hash FROM dolt_commit_ancestors WHERE commit_hash = ? AND parent_index = 0`,
      head,
    ).toArray()[0]?.["parent_hash"];
    const previous = typeof working === "string" ? committedWorkspaceEvent(sql, working) : null;
    if (!previous || typeof working !== "string") {
      throw new SemanticVcsError("IntegrityFailure", "Recorded save has no prior workspace event");
    }
    const applications = workspaceApplicationsAt(sql, working, previous.head);
    const sources = workspaceMergeSourcesAt(sql, working, previous.head, applications);
    if (rows[0]?.["kind"] !== (sources.eventIds.length + sources.deltaIds.length > 0 ? "integration-commit" : "commit")) {
      throw new SemanticVcsError("IntegrityFailure", "Recorded save kind differs from its native ancestry");
    }
    return { head, result: this.#saveResult(contextId, eventId, applications, sources) };
  }

  #saveResult(contextId: string, eventId: string, applicationIds: string[], sources: ReturnType<typeof workspaceMergeSourcesAt>): VcsCommitResult {
    return {
      contextId,
      event: { kind: "event", eventId },
      committedApplicationIds: applicationIds,
      integrationSourceEventIds: sources.eventIds,
      integrationSourceDeltaIds: sources.deltaIds,
    };
  }

  /** Install a fast-forward from the exact shared revision, or retain both divergent tips. */
  pullMain(contextId: string, expectedHead: string, expectedMain: string) {
    return this.#run(async () => {
      const branch = this.#contextBranch(contextId);
      const current = this.#dolt.hashOf(branch);
      if (current !== expectedHead) {
        if (current === expectedMain && this.#mergeBase(expectedHead, current) === expectedHead) {
          return { kind: "advanced" as const, head: current };
        }
        throw new HistoryHeadChanged(expectedHead, current);
      }
      const main = await this.#fetchExpectedMain(expectedMain);
      const base = this.#mergeBase(current, main);
      if (base === main) return { kind: "unchanged" as const, head: current };
      if (!base) {
        throw new SemanticVcsError("InvalidReference", "Workspace main and context share no history");
      }
      if (base !== current) return { kind: "diverged" as const, head: current, main, base };
      this.#checkoutExpected(contextId, current);
      const advanced = this.#dolt.merge(main, {
        resolve() { throw new Error("Workspace pull stopped being a fast-forward"); },
      });
      if (!advanced.fastForward || advanced.hash !== main)
        throw new Error("Workspace pull did not install the selected main revision");
      return { kind: "advanced" as const, head: advanced.hash };
    });
  }

  /** Inspect F1's exact conflict and violation rows before accepting resolutions. */
  previewMainMerge(contextId: string, head: string, expectedMain: string): Promise<MainMergePreview> {
    return this.#previewMerge(head, () => this.#fetchExpectedMain(expectedMain), contextId);
  }

  /** Find the exact source in shared history or an admitted branch of this cell. */
  resolveMerge(
    contextId: string, target: StateNodeRef, source: StateNodeRef, readableContextIds: readonly string[],
  ): Promise<ScopedMergeSelection> {
    return this.#run(async () => {
      const { sql } = this.#storage;
      const head = this.#resolveState(contextId, target);
      if (!head) throw new SemanticVcsError("InvalidReference", "Workspace integration names an unavailable target");
      const published = await this.#fetchMain();
      const main = workspaceCommitForRef(sql, published, source);
      if (main) {
        const base = this.#mergeBase(head, main);
        if (base) return { head, base, main };
      } else {
        const contexts = [...new Set([contextId, ...readableContextIds])];
        for (const { contextId: sourceContextId, head: tip } of this.#contextTips(contexts)) {
          const sourceHead = workspaceCommitForRef(sql, tip, source);
          if (!sourceHead) continue;
          const base = this.#mergeBase(head, sourceHead);
          if (base) return { head, base, source: { contextId: sourceContextId, head: sourceHead } };
        }
      }
      throw new SemanticVcsError("InvalidReference", "Workspace integration names an unavailable source or unrelated history");
    });
  }

  async reviewMerge(
    contextId: string, input: VcsCompareInput, readableContextIds: readonly string[],
    observation: HistoryMergeObservation | null,
  ) {
    if (input.source.kind === "external-delta") {
      const { deltaId } = input.source;
      return this.#run(() => reviewExternalMerge(
        this.#storage.sql, input, this.#externalMergeSource(contextId, input.target, deltaId, false), observation,
      ));
    }
    const selection = await this.resolveMerge(contextId, input.target, input.source, readableContextIds);
    const { head, base } = selection;
    const sourceHead = "main" in selection ? selection.main : selection.source.head;
    if (sourceHead === base) {
      throw new SemanticVcsError("SourceIsAncestor", "The compare source is already in the target's history", {
        target: input.target, source: input.source,
      });
    }
    const preview = await this.#previewMerge(head, () =>
      "main" in selection ? this.#fetchCanonicalRevision(selection.main) : this.#resolveContextSource(selection.source),
    );
    return this.#run(() => reviewHistoryMerge(this.#storage.sql, input, this.#stateAt(base).state, preview, observation));
  }

  mergeExternal(
    input: VcsMergeInput, cause: HistoryCommand["cause"],
    triggerEvidence: WorkUnitRecord["triggerEvidence"] = null, content?: HistoryMergeContent,
  ): Promise<HistoryMergeResult> {
    return this.#run(async () => {
      const { contextId, commandId, expectedWorkingHead, source } = input;
      if (source.kind !== "external-delta") throw new SemanticVcsError("InvalidReference", "An external delta is required");
      const { sql } = this.#storage;
      const receipts = this.#receipts;
      if (!receipts) throw new Error("External integration requires local receipt storage");
      const receiptKey = `history-external-merge:${sha256HexSyncText(canonicalJson([contextId, commandId]))}`;
      const command = { commandId, method: "merge", requestDigest: compactId("external-merge-request", input), cause };
      const current = this.#dolt.hashOf(this.#contextBranch(contextId));
      if (this.#hasCommand(current, contextId, command)) {
        const stored = receipts.get(receiptKey);
        if (!stored) throw new SemanticVcsError("IntegrityFailure", "External integration has no recorded receipt");
        const result = vcsMergeResultSchema.parse(JSON.parse(stored));
        const head = workspaceCommitForRef(sql, current, result.workingHead);
        if (!head) throw new SemanticVcsError("IntegrityFailure", "External integration receipt has no revision");
        return { kind: "committed", head, value: result.workingHead, result };
      }

      const exact = this.#externalMergeSource(contextId, expectedWorkingHead, source.deltaId);
      if (exact.delta.status !== "active") throw new SemanticVcsError("InvalidReference", "External delta is no longer active");
      const planned = planExternalMerge(sql, exact, input, content?.observation ?? null);
      if (planned.kind === "read-content") return planned;
      const { draft, chosen, coordinates, compositions, origins } = planned;
      const blobs = [...new Map(draft.blobs!.map((blob) => [blob.contentHash, blob])).values()];
      const contentHashes = blobs.map(({ contentHash }) => contentHash).sort(compareUtf16CodeUnits);
      if (blobs.length > 0 && !content?.contentHashes) return { kind: "prepare-content", blobs };
      if (content?.contentHashes && canonicalJson(content.contentHashes) !== canonicalJson(contentHashes)) {
        throw new SemanticVcsError("IntegrityFailure", "Prepared external merge bytes changed");
      }
      const report = (target: StateNodeRef, outcomes: typeof coordinates, intents: typeof planned.intents, concluded: boolean) => {
        const { result } = paginateHistoryComparison({ target, source, limit: 500, statusFilter: "conflict" },
          exact.base, outcomes, intents, concluded);
        return { resolution: result.resolution, counts: result.counts, intents: result.intents,
          intentsTruncated: result.intentsTruncated, conflicts: result.coordinates, nextConflictCursor: result.nextCursor };
      };
      if (chosen.size === 0 && planned.concluded) {
        const result = vcsMergeResultSchema.parse({ status: "unchanged", contextId, workingHead: expectedWorkingHead,
          ...report(expectedWorkingHead, coordinates, planned.intents, true) });
        return { kind: "committed", head: current, value: expectedWorkingHead, result };
      }
      const keys = sql.exec("SELECT external_lineage_json FROM dolt_at_gad_work_units(?) WHERE work_unit_id = ?",
        exact.draft, exact.delta.workUnitId).toArray()[0]?.["external_lineage_json"];
      const evidenceKeys: unknown = typeof keys === "string" ? JSON.parse(keys) : null;
      if (!Array.isArray(evidenceKeys) || evidenceKeys.length === 0 || evidenceKeys.some((key) => typeof key !== "string")) {
        throw new SemanticVcsError("IntegrityFailure", "External merge is missing its source lineage");
      }
      const prepared = await this.#prepareMutation(current, input, command, draft, triggerEvidence, undefined, evidenceKeys);
      const applicationId = prepared.application.application.applicationId;
      const workingHead = { kind: "application" as const, applicationId };
      const decision = prepared.application.decisions[0]!;
      const decisions = new Map(decision.entries.map((entry) => [canonicalJson(["file", entry.coordinate.id]), entry]));
      const outcomes = coordinates.map((coordinate) => {
        if (!chosen.has(coordinate.coordinate.id)) return coordinate;
        return { ...coordinate, status: "resolved" as const, decisionId: decision.decisionId, resolutions: [] };
      });
      const intents = reviewIntents(sql, { head: current, main: exact.draft }, outcomes, decisions);
      const composed = decision.entries.flatMap(({ coordinate, resolution }) => {
        if (resolution !== "composed" || !compositions.has(coordinate.id)) return [];
        return [{ coordinate, ours: readHistoryWorkUnitIntent(sql, current, origins.get(coordinate.id)?.authoredByWorkUnitId),
          theirs: readHistoryWorkUnitIntent(sql, exact.draft, exact.delta.workUnitId) }];
      });
      const result = vcsMergeResultSchema.parse({ ...prepared.result, status: "working", workingHead,
        decisionId: decision.decisionId, outcomes: outcomes.filter(({ coordinate }) => chosen.has(coordinate.id)).slice(0, 500),
        composed, ...report(workingHead, outcomes, intents, true) });
      const { head } = this.#commit(contextId, current, "Integrate external workspace changes", () => {
        this.#retainExternalMergeEvidence(exact, contextId);
        this.#writePreparedApplication(current, command, prepared.application);
        receipts.set(receiptKey, canonicalJson(result));
      });
      return { kind: "committed", head, value: workingHead, result };
    });
  }

  #retainExternalMergeEvidence(source: HistoryExternalMergeSource, contextId: string): void {
    const { sql } = this.#storage;
    const { workUnitId, deltaId } = source.delta;
    if (this.#externalDelta(source.head, contextId, deltaId)) return;
    sql.exec(`INSERT INTO gad_work_units SELECT * FROM dolt_at_gad_work_units(?) WHERE work_unit_id = ?`,
      source.draft, workUnitId);
    sql.exec(`INSERT INTO gad_changes SELECT * FROM dolt_at_gad_changes(?) WHERE work_unit_id = ?`,
      source.draft, workUnitId);
    sql.exec(`INSERT INTO gad_change_coordinates SELECT coords.* FROM dolt_at_gad_change_coordinates(?1) AS coords
       JOIN dolt_at_gad_changes(?1) AS changes USING (change_id) WHERE changes.work_unit_id = ?2`,
      source.draft, workUnitId);
    sql.exec(`INSERT INTO gad_external_deltas SELECT * FROM dolt_at_gad_external_deltas(?) WHERE delta_id = ? AND owner_context_id = ?`,
      source.draft, deltaId, contextId);
  }

  async mergeLocations(
    contextId: string, target: StateNodeRef, source: StateNodeRef, readableContextIds: readonly string[],
  ) {
    const selection = await this.resolveMerge(contextId, target, source, readableContextIds);
    const sourceHead = "main" in selection ? selection.main : selection.source.head;
    return this.#run(() => {
      const { sql } = this.#storage;
      const scope = workspaceMergeScope(sql, selection.base, sourceHead);
      const review = historyMergePlacements(sql, { head: selection.head, base: selection.base, main: sourceHead }, scope);
      const locations = new Map<string, { kind: "folder" | "file"; path: string }>();
      for (const { coordinate } of review) {
        const kind = coordinate.kind === "file" ? "file" : "folder";
        for (const path of Object.values(coordinate.paths)) {
          locations.set(canonicalJson([kind, path]), { kind, path });
        }
      }
      return { target, source, locations: [...locations.values()] };
    });
  }

  async previewContextMerge(contextId: string, head: string, source: MergeSource) {
    const { main, ...preview } = await this.#previewMerge(
      head, () => this.#resolveContextSource(source), contextId,
    );
    return { ...preview, source: main };
  }

  #previewMerge(head: string, readSource: () => Promise<string>, workingContextId?: string): Promise<MainMergePreview> {
    return this.#run(async () => {
      if (workingContextId !== undefined) this.#assertHead(this.#contextBranch(workingContextId), head);
      const main = await readSource();
      const base = this.#mergeBase(head, main);
      if (!base) {
        throw new SemanticVcsError("InvalidReference", "Workspace source and context share no history");
      }
      if (base === main) {
        return { head, main, base, incoming: [], placements: [], conflicts: [], violations: [] };
      }
      const { sql } = this.#storage;
      const scope = workspaceMergeScope(sql, base, main);
      const incoming = [...scope.values()];
      const placements = historyMergePlacements(sql, { head, main, base }, scope);
      if (base === head) {
        return { head, main, base, incoming, placements, conflicts: [], violations: [] };
      }
      const originalBranch = this.#dolt.branch.current();
      const previewBranch = `merge-preview/${crypto.randomUUID()}`;
      const rollback = new Error("Workspace merge preview complete");
      let preview: MainMergePreview | undefined;
      this.#dolt.branch.create(previewBranch, { from: head });
      try {
        this.#dolt.checkout(previewBranch);
        this.#dolt.merge(main, {
          fastForward: false,
          resolve(merge) {
            if (merge.ours !== head || merge.theirs !== main || merge.base !== base) {
              throw new Error("Workspace merge preview changed its selected revisions");
            }
            preview = {
              head, main, base, incoming, placements,
              conflicts: merge.conflicts.map(({ table, key, base, ours, theirs, ourChange, theirChange }) =>
                ({ table, key, base, ours, theirs, ourChange, theirChange })
              ),
              violations: merge.violations.map(({ table, type, info, row }) => ({ table, type, info, row })),
            };
            throw rollback;
          },
        });
      } catch (error) {
        if (error !== rollback) throw error;
      } finally {
        const previewHead = this.#dolt.hashOf(previewBranch);
        if (this.#dolt.branch.current() === previewBranch) this.#dolt.checkout(originalBranch);
        this.#dolt.branch.delete(previewBranch, { force: true });
        if (previewHead !== head) throw new Error("Workspace merge preview changed its target revision");
      }
      if (!preview) throw new Error("Workspace merge did not produce a preview");
      return preview;
    });
  }

  /** Resolve the selected whole-row conflicts and write provenance in the native merge. */
  mergeReviewedMain(
    selection: HistoryMergeSelection,
    input: VcsMergeInput,
    cause: HistoryCommand["cause"],
    triggerEvidence: WorkUnitRecord["triggerEvidence"] = null,
    content: HistoryMergeContent | null = null,
  ): Promise<HistoryMergeResult> {
    return this.#mergeReviewed(selection, input, cause, triggerEvidence, content);
  }

  mergeReviewedContext(
    selection: { head: string; base: string },
    source: MergeSource,
    input: VcsMergeInput,
    cause: HistoryCommand["cause"],
    triggerEvidence: WorkUnitRecord["triggerEvidence"] = null,
    content: HistoryMergeContent | null = null,
  ): Promise<HistoryMergeResult> {
    return this.#mergeReviewed({ ...selection, main: source.head }, input, cause, triggerEvidence, content, source);
  }

  #mergeReceipt(at: string, selection: HistoryMergeSelection, contextId: string, commandId: string) {
    const receipt = this.#committedMutation(at, contextId, commandId, true);
    return {
      kind: "committed" as const,
      head: receipt.head,
      value: receipt.result.workingHead,
      result: settledHistoryMerge(this.#storage.sql, selection, receipt.head, receipt.result),
    };
  }

  #mergeReviewed(
    selection: HistoryMergeSelection,
    input: VcsMergeInput,
    cause: HistoryCommand["cause"],
    triggerEvidence: WorkUnitRecord["triggerEvidence"],
    content: HistoryMergeContent | null,
    sourceContext?: MergeSource,
  ): Promise<HistoryMergeResult> {
    return this.#run<HistoryMergeResult>(async () => {
      const { sql } = this.#storage;
      const { commandId, contextId } = input;
      const command: HistoryCommand = {
        commandId, method: "merge",
        requestDigest: compactId("merge-request", { selection, input }),
        cause,
      };
      const priorContextDigest = sourceContext
        ? compactId("merge-request", { selection, input, sourceContext })
        : undefined;
      const current = this.#dolt.hashOf(this.#contextBranch(contextId));
      if (this.#hasCommand(current, contextId, command, priorContextDigest)) {
        return this.#mergeReceipt(current, selection, contextId, commandId);
      }

      if (input.source.kind !== "event") {
        throw new SemanticVcsError("InvalidReference", "Workspace integration requires a saved source event");
      }
      if (input.coordinates?.length) {
        throw new SemanticVcsError("IntegrationIncomplete", "Workspace integration requires the complete source revision");
      }
      const { head } = selection;
      if (current !== head) throw new HistoryHeadChanged(head, current);
      const main = sourceContext
        ? await this.#resolveContextSource(sourceContext)
        : await this.#fetchCanonicalRevision(selection.main);
      const base = this.#mergeBase(head, main);
      const source = committedWorkspaceEvent(sql, main);
      if (!base || base !== selection.base || base === main ||
          source?.head !== main || source.eventId !== input.source.eventId ||
          workspaceCommitForRef(sql, head, input.expectedWorkingHead) !== head) {
        throw new SemanticVcsError("RevisionChanged", "Workspace integration changed its reviewed revisions");
      }

      const scope = workspaceMergeScope(sql, base, main);
      const resolutions = Array.isArray(input.resolutions) ? input.resolutions : [];
      const fallback = Array.isArray(input.resolutions) ? undefined : input.resolutions?.allRemaining;
      const keyOf = ({ kind, id }: WorkspaceMergeScopeEntry["coordinate"]) => canonicalJson([kind, id]);
      const declared = new Map(resolutions.map((resolution) => [keyOf(resolution.coordinate), resolution]));
      if (declared.size !== resolutions.length) {
        throw new SemanticVcsError("IntegrityFailure", "Workspace integration repeats a placement");
      }
      const candidates = [...scope.values()].flatMap(({ coordinate, changeIds }) => {
        if (coordinate.kind !== "file") return [];
        const choice = declared.get(keyOf(coordinate)) ?? fallback;
        if (choice && choice.resolution !== "composed") return [];
        const coordinates = historyTextMergeInputs(sql, selection, coordinate.id);
        return coordinates ? [{ coordinate, coordinates, changeIds }] : [];
      });
      const requiredHashes = [...new Set(candidates.flatMap(({ coordinates }) => [
        coordinates.before.contentHash, coordinates.ours.contentHash, coordinates.theirs.contentHash,
      ]))].sort(compareUtf16CodeUnits);
      if (requiredHashes.length > 0 && !content) {
        return { kind: "read-content", contentHashes: requiredHashes };
      }
      const composed = new Map<string, NonNullable<ReturnType<typeof composeHistoryText>>>();
      if (content) {
        const observed = readHistoryMergeObservations(requiredHashes, content.observation);
        for (const { coordinate, coordinates, changeIds } of candidates) {
          const result = composeHistoryText(sql, selection, coordinates, observed, composed.size, changeIds);
          if (result) composed.set(keyOf(coordinate), result);
        }
      }
      const prepared = [...composed.values()];
      const blobs = [...new Map(prepared.map(({ blob }) => [blob.contentHash, blob])).values()];
      if (blobs.length > 0 && !content?.contentHashes) {
        return { kind: "prepare-content", blobs };
      }
      if (content?.contentHashes &&
          canonicalJson(content.contentHashes) !== canonicalJson(blobs.map(({ contentHash }) => contentHash).sort(compareUtf16CodeUnits))) {
        throw new SemanticVcsError("IntegrityFailure", "Prepared text merge bytes do not match the selected revisions");
      }
      const origins = prepared.flatMap(({ localOrigin, sourceOrigin }) => [localOrigin, sourceOrigin]);
      const externalKeys = [...new Set(origins.flatMap(({ externalKeys }) => externalKeys))].sort(compareUtf16CodeUnits);
      if (externalKeys.length > 256) {
        throw new SemanticVcsError("ScopeTooLarge", "Text merge has too many external lineage keys");
      }
      this.#checkoutExpected(contextId, head);
      let value: StateNodeRef | undefined;
      const merged = this.#dolt.merge(main, {
        fastForward: false,
        message: "Integrate shared workspace history",
        resolve: (merge) => {
          if (merge.ours !== head || merge.theirs !== main || merge.base !== base) {
            throw new SemanticVcsError("RevisionChanged", "Native merge changed its reviewed revisions");
          }
          const entries: NonNullable<MutationDraft["decisions"]>[number]["entries"] = [];
          let resolvedText = 0;
          for (const conflict of merge.conflicts) {
            const key = conflict.table === "files" ? canonicalJson(["file", conflict.key["file_id"]])
              : conflict.table === "repositories" ? canonicalJson(["repository", conflict.key["repository_id"]])
              : null;
            const incoming = key === null ? undefined : scope.get(key);
            const selected = key === null ? undefined : declared.get(key) ?? fallback;
            if (!key || !incoming?.changeIds.length) {
              throw new SemanticVcsError("ConflictPresent", "Workspace integration needs an exact row resolution");
            }
            const text = composed.get(key);
            if (text && text.file.result.presence === "placed") {
              const { fileId, repositoryId, path, mode, contentHash, contentKind, byteLength, coordinateExtent } = text.file.result;
              sql.exec(
                `UPDATE files SET repository_id = ?, path = ?, mode = ?, content_hash = ?,
                    content_kind = ?, byte_length = ?, coordinate_extent = ? WHERE file_id = ?`,
                repositoryId, path, mode, contentHash, contentKind, byteLength, coordinateExtent, fileId,
              );
              conflict.resolve();
              entries.push({
                coordinate: incoming.coordinate,
                resolution: "composed",
                accountedSourceChangeIds: incoming.changeIds,
                rationale: selected?.rationale ?? null,
                resultChangeRef: text.file.changeRef,
              });
              resolvedText += 1;
              declared.delete(key);
              continue;
            }
            if (!selected || selected.resolution === "composed") {
              throw new SemanticVcsError("ConflictPresent", "Workspace integration needs an exact row resolution");
            }
            if (selected.resolution === "theirs") conflict.takeTheirs();
            else conflict.keepOurs();
            entries.push({
              coordinate: incoming.coordinate,
              resolution: selected.resolution === "theirs" ? "adopt" : selected.resolution,
              accountedSourceChangeIds: incoming.changeIds,
              rationale: selected.rationale ?? null,
            });
            declared.delete(key);
          }
          declineHistoryFileCollisions(sql, merge, (fileId) => {
            const key = keyOf({ kind: "file", id: fileId });
            const prior = entries.find(({ coordinate }) => keyOf(coordinate) === key);
            const selected = prior ?? declared.get(key) ?? fallback;
            const incoming = scope.get(key);
            if (!incoming?.changeIds.length ||
                (selected?.resolution !== "ours" && selected?.resolution !== "current")) {
              throw new SemanticVcsError("ConflictPresent", "Workspace integration needs an exact placement resolution");
            }
            if (!prior) {
              entries.push({
                coordinate: incoming.coordinate,
                resolution: selected.resolution,
                accountedSourceChangeIds: incoming.changeIds,
                rationale: selected.rationale ?? null,
              });
            }
            declared.delete(key);
          });
          if (declared.size > 0 || resolvedText !== composed.size) {
            throw new SemanticVcsError("RevisionChanged", "Prepared resolutions differ from the native conflict");
          }
          entries.sort((left, right) =>
            compareUtf16CodeUnits(keyOf(left.coordinate), keyOf(right.coordinate)),
          );
          const draft: MutationDraft = {
            kind: "merge",
            intentSummary: input.intentSummary ?? null,
            incorporatedChangeIds: entries.flatMap((entry) => entry.accountedSourceChangeIds),
            changes: prepared.map(({ change }) => change),
            fileResults: prepared.map(({ file }) => file),
            repositoryResults: [],
            contentDerivations: prepared.flatMap(({ derivations }) => derivations),
            decisions: [{ targetState: input.expectedWorkingHead, sourceEventId: source.eventId, sourceDeltaId: null, entries }],
          };
          const { plan } = prepareApplication(input, draft, commandId, {
            now: () => new Date().toISOString(),
            workUnitEvidence: () => ({ authorContextId: contextId, triggerEvidence }),
            contentIntegrity: () => ({
              class: origins.some(({ contentClass }) => contentClass === "external") ? "external" : "internal",
              externalKeys,
              contentOrigins: new Map(),
            }),
            contentOrigins: () => new Map(),
            invertedCounteractions: () => {
              throw new SemanticVcsError("IntegrityFailure", "A whole-row merge cannot counteract a change");
            },
            preparePlacement: () => ({
              placement: null,
              resultRoot: compactId("dolt-merge-transition", { head, base, main, entries }),
              workspacePlanCompletedAt: Date.now(),
            }),
          });
          validateApplicationPlan(plan);
          this.#recordCommand(contextId, command, plan.workUnit.createdAt);
          this.#persistApplication({ ...plan, placement: null, decisions: entries.length ? plan.decisions : [] });
          value = { kind: "application", applicationId: plan.application.applicationId };
        },
      });
      if (merged.fastForward || merged.upToDate || !value) {
        throw new Error("Workspace integration did not record its two parents and application");
      }
      const receipt = this.#mergeReceipt(merged.hash, selection, contextId, commandId);
      if (receipt.head !== merged.hash || stateNodeKey(receipt.value) !== stateNodeKey(value)) {
        throw new SemanticVcsError("IntegrityFailure", "Native merge recorded a different application");
      }
      return receipt;
    });
  }

  mergeMain(contextId: string, expectedHead: string, options: ResolvingMerge) {
    return this.#run(async () => {
      await this.#fetchMain();
      this.#checkoutExpected(contextId, expectedHead);
      return this.#dolt.merge("origin/main", options);
    });
  }

  mergeContext(
    contextId: string,
    expectedHead: string,
    source: MergeSource,
    options: ResolvingMerge
  ) {
    return this.#run(async () => {
      const sourceHead = await this.#resolveContextSource(source);
      this.#checkoutExpected(contextId, expectedHead);
      return this.#dolt.merge(sourceHead, options);
    });
  }

  async #resolveContextSource(source: MergeSource): Promise<string> {
    const context = this.#contextBranch(source.contextId);
    let sourceBranch = context;
    if (source.participantId !== undefined) {
      const participant = branchSegment(source.participantId);
      if (participant !== this.#participant) {
        const published = `pub/${participant}/${context.slice("ctx/".length)}`;
        const fetched = await this.#dolt.fetch("origin", {
          branches: [published],
          transport: this.#transport,
        });
        if (!fetched.branches[published]) {
          throw new SemanticVcsError("InvalidReference", "Published workspace source context is unavailable");
        }
        sourceBranch = `origin/${published}`;
      }
    }
    if (source.head !== this.#mergeBase(sourceBranch, source.head)) {
      throw new SemanticVcsError("InvalidReference", "The requested commit is outside the source context");
    }
    return source.head;
  }

  publishContext(contextId: string, expectedHead: string) {
    return this.#run(() => {
      const branch = this.#contextBranch(contextId);
      this.#assertHead(branch, expectedHead);
      return this.#dolt.push("origin", branch, {
        to: `pub/${this.#participant}/${branch.slice("ctx/".length)}`,
        transport: this.#transport,
      });
    });
  }

  publishApprovedMain(
    contextId: string,
    publication: MainPublication,
    grantTarget: DoltRemoteTarget
  ) {
    return this.#run(async () => {
      const branch = this.#contextBranch(contextId);
      this.#assertHead(branch, publication.proposedHead);
      this.#configureRemote("approved-main", grantTarget);
      try {
        return await this.#dolt.push("approved-main", branch, {
          to: "main",
          transport: this.#transport,
        });
      } finally {
        this.#dolt.remote.remove("approved-main");
      }
    });
  }

  archiveCommittedContexts(
    contexts: readonly CommittedContext[],
    main: string,
    grantTarget: DoltRemoteTarget
  ): Promise<void> {
    return this.#run(() => {
        // Resolve and check all tips before publishing anything. Applications
        // after a committed tip can already be stored on the context branch.
        const archives = contexts.map(({ contextId, head }) => {
          const context = this.#contextBranch(contextId);
          const committed = this.#dolt.hashOf(head);
          if (committed !== this.#mergeBase(context, committed)) {
            throw new Error(`Committed tip is outside context ${contextId}`);
          }
          return { context, committed };
        });
        return this.#archiveCommittedBranches(archives, main, grantTarget);
    });
  }

  archiveAllCommittedContexts(main: string, grantTarget: DoltRemoteTarget): Promise<void> {
    return this.#run(() => {
      const archives = this.#dolt.branch.list().filter(({name, hash}) => name.startsWith("ctx/") && hash !== main).map(({name, hash}) => {
        const event = committedWorkspaceEvent(this.#storage.sql, hash);
        if (!event) throw new Error(`Workspace history lacks a committed event for ${name}`);
        return { context: name, committed: event.head };
      });
      return this.#archiveCommittedBranches(archives, main, grantTarget);
    });
  }

  retireContext(contextId: string, main: string, origin: DoltRemoteTarget): Promise<void> {
    return this.#run(async () => {
      const journal = this.#receipts;
      if (!journal) throw new Error("Workspace context retirement requires local receipt storage");
      const context = `ctx/${branchSegment(contextId)}`;
      journal.set(`history-retired:${context}`, "true");
      const branches = this.#dolt.branch.list();
      const importPrefix = `import/${branchSegment(contextId)}/`;
      for (const { name } of branches) {
        if (name.startsWith(importPrefix) || name === this.#externalBranch(contextId)) this.#removeImportBranch(name);
      }
      const branch = branches.find(({ name }) => name === context);
      if (!branch) return;
      if (branch.hash !== main) {
        const committed = committedWorkspaceEvent(this.#storage.sql, branch.hash);
        if (!committed) throw new Error(`Workspace history lacks a committed event for ${context}`);
        await this.#archiveCommittedBranches([{ context, committed: committed.head }], main, origin);
      }
      if (this.#dolt.branch.current() === context) this.#dolt.checkout("main");
      this.#dolt.branch.delete(context, { force: true });
    });
  }

  async #archiveCommittedBranches(archives: readonly { context: string; committed: string }[], main: string, grantTarget: DoltRemoteTarget): Promise<void> {
      const candidates = archives.filter(({ committed }) => committed !== main);
      if (candidates.length === 0) return;
      const remote = "retirement";
      this.#configureRemote(remote, grantTarget);
      try {
        await this.#dolt.fetch(remote, { branches: ["main"], transport: this.#transport });
        for (const { context, committed } of candidates) {
          if (committed === this.#mergeBase(main, committed)) continue;
          const branch = `retired/${this.#participant}/${context.slice("ctx/".length)}`;
          if (!this.#dolt.branch.list().some((entry) => entry.name === branch)) {
            this.#dolt.branch.create(branch, { from: committed });
          }
          this.#assertHead(branch, committed);
          await this.#dolt.push(remote, branch, { transport: this.#transport });
          this.#dolt.branch.delete(branch, { force: true });
        }
      } finally {
        this.#dolt.remote.remove(remote);
      }
  }

  #mergeBase(left: string, right: string): string | null {
    const base = this.#dolt.query("SELECT dolt_merge_base(?1, ?2)", [
      { index: 1, value: left },
      { index: 2, value: right },
    ]).rows[0]?.[0];
    if (typeof base === "string" || base === null) return base;
    throw new Error("GAD merge base query did not return a hash");
  }

  #resolveState(contextId: string, ref: StateNodeRef): string | null {
    return workspaceCommitForRef(
      this.#storage.sql,
      this.#dolt.hashOf(this.#contextBranch(contextId)),
      ref
    );
  }

  async #resolveReadableState(contextId: string, ref: StateNodeRef, readableContextIds: readonly string[] = []): Promise<string | null> {
    const local = this.#resolveState(contextId, ref);
    if (local) return local;
    const { sql } = this.#storage;
    if (readableContextIds.length > 0) {
      for (const { head } of this.#contextTips(readableContextIds.filter((id) => id !== contextId))) {
        const exact = workspaceCommitForRef(sql, head, ref);
        if (exact) return exact;
      }
    }
    const main = await this.#fetchMain();
    return workspaceCommitForRef(sql, main, ref);
  }

  async #requireReadableState(
    contextId: string, ref: StateNodeRef, readableContextIds: readonly string[] = [],
  ): Promise<string> {
    const commit = await this.#resolveReadableState(contextId, ref, readableContextIds);
    if (!commit) {
      throw new SemanticVcsError("InvalidReference", "Workspace read names a state outside this workspace context");
    }
    return commit;
  }

  #commit<T>(contextId: string, expectedHead: string, message: DoltCommitMessage, write: () => T) {
    const branch = this.#checkoutExpected(contextId, expectedHead);
    return this.#commitBranch(branch, message, write);
  }

  #commitBranch<T>(branch: string, message: DoltCommitMessage, write: () => T) {
    if (this.#dolt.branch.current() !== branch) this.#dolt.checkout(branch);
    const value = this.#storage.transactionSync(write, { commit: message });
    return { value, head: this.#dolt.hashOf(branch) };
  }

  #hasCommand(at: string, contextId: string, command: HistoryCommand, priorDigest?: string): boolean {
    if (this.#receipts?.get(discardReceiptKey(command.commandId)) != null) {
      throw new SemanticVcsError("CommandIdReuse", "This workspace command was recorded as a discard");
    }
    const prior = this.#storage.sql
      .exec(
        `SELECT scope_kind, scope_id, method, request_digest, cause_log_id, cause_head, cause_invocation_id
         FROM dolt_at_commands(?) WHERE command_id = ?`,
        at,
        command.commandId
      )
      .toArray()[0];
    if (!prior) return false;
    const cause = command.cause.parent;
    if (
      prior["scope_kind"] !== "context" ||
      prior["scope_id"] !== contextId ||
      prior["method"] !== command.method ||
      (prior["request_digest"] !== command.requestDigest &&
        (priorDigest === undefined || prior["request_digest"] !== priorDigest)) ||
      prior["cause_log_id"] !== (cause?.logId ?? null) ||
      prior["cause_head"] !== (cause?.head ?? null) ||
      prior["cause_invocation_id"] !== (cause?.invocationId ?? null)
    ) {
      throw new SemanticVcsError(
        "CommandIdReuse",
        `Workspace command ${command.commandId} changed`
      );
    }
    return true;
  }

  #recordCommand(contextId: string, command: HistoryCommand, createdAt: string): void {
    const cause = command.cause.parent;
    this.#storage.sql.exec(
      `INSERT INTO commands (command_id, scope_kind, scope_id, method, request_digest,
        cause_log_id, cause_head, cause_invocation_id, created_at) VALUES (?, 'context', ?, ?, ?, ?, ?, ?, ?)`,
      command.commandId,
      contextId,
      command.method,
      command.requestDigest,
      cause?.logId ?? null,
      cause?.head ?? null,
      cause?.invocationId ?? null,
      createdAt
    );
  }

  #run<T>(turn: () => T | Promise<T>): Promise<T> {
    return serializeByKey(this.#turns, this.#participant, () => {
      this.#restoreDiscard();
      return turn();
    });
  }

  #configureRemote(name: string, target: DoltRemoteTarget): void {
    if (this.#dolt.remote.list().some((remote) => remote.name === name)) {
      this.#dolt.remote.remove(name);
    }
    this.#dolt.remote.add(name, target);
  }

  #originIdentity(origin: DoltRemoteTarget): string {
    return sha256HexSyncText(canonicalJson({
      ref: origin.ref ?? origin.id?.toString() ?? null,
      token: origin.token,
    }));
  }

  async #connectOrigin(origin: DoltRemoteTarget, identity: string): Promise<string> {
    if (identity !== this.#connectedOrigin) {
      this.#connectedOrigin = undefined;
      this.#configureRemote("origin", origin);
    }
    const main = await this.#fetchMain();
    this.#connectedOrigin = identity;
    return main;
  }

  async #fetchMain(): Promise<string> {
    const { branches } = await this.#dolt.fetch("origin", {
      branches: ["main"],
      transport: this.#transport,
    });
    const head = branches["main"];
    if (!head) throw new Error("Canonical GAD main is unavailable");
    return head;
  }

  async #fetchCanonicalRevision(revision: string): Promise<string> {
    const main = await this.#fetchMain();
    if (this.#mergeBase(main, revision) !== revision)
      throw new SemanticVcsError("InvalidReference", "Workspace integration revision is outside shared history");
    return revision;
  }

  async #fetchExpectedMain(expected: string): Promise<string> {
    const main = await this.#fetchMain();
    if (main !== expected) throw new HistoryHeadChanged(expected, main);
    return main;
  }

  #contextBranch(contextId: string): string {
    const branch = `ctx/${branchSegment(contextId)}`;
    if (this.#receipts?.get(`history-retired:${branch}`)) {
      throw new Error("Workspace participant context has retired");
    }
    return branch;
  }

  #openBranch(contextId: string, at: string): string {
    const branch = this.#contextBranch(contextId);
    if (!this.#dolt.branch.list().some((candidate) => candidate.name === branch)) {
      this.#dolt.branch.create(branch, { from: at });
    }
    return this.#dolt.hashOf(branch);
  }

  #assertHead(branch: string, expectedHead: string): void {
    const actual = this.#dolt.hashOf(branch);
    if (actual !== expectedHead) throw new HistoryHeadChanged(expectedHead, actual);
  }

  #checkoutExpected(contextId: string, expectedHead: string): string {
    const branch = this.#contextBranch(contextId);
    this.#assertHead(branch, expectedHead);
    if (this.#dolt.branch.current() !== branch) this.#dolt.checkout(branch);
    return branch;
  }
}
