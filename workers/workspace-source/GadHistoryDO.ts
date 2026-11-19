import { canonicalJson, compareUtf16CodeUnits, sha256HexSyncText } from "@vibestudio/content-addressing";
import { DurableObjectBase, rpc } from "@vibestudio/durable";
import { doltRemotesOf, type DoltRemoteTarget } from "@vibestudio/durable/dolt";
import { rpcBytesOf } from "@vibestudio/rpc";
import { mainRpcMethods } from "@vibestudio/service-schemas/mainRpc";
import {
  vcsBlameInputSchema,
  vcsCompareInputSchema,
  vcsCommitInputSchema,
  vcsCopyInputSchema,
  vcsDiscardInputSchema,
  vcsEditInputSchema,
  vcsExternalDeltaLifecycleInputSchema,
  vcsImportSnapshotInputSchema,
  vcsHistoryInputSchema,
  vcsInspectInputSchema,
  vcsListDirectoryInputSchema,
  vcsListFilesInputSchema,
  vcsMergeInputSchema,
  vcsMoveInputSchema,
  vcsNeighborsInputSchema,
  vcsReadFilesInputSchema,
  vcsQueryInputSchema,
  vcsRegisterExternalDeltaInputSchema,
  type VcsQueryInput,
  vcsReadMemoryInputSchema,
  vcsRevertInputSchema,
  vcsResolveRepositoryInputSchema,
  vcsSearchInputSchema,
  vcsSemanticNodeRefSchema,
  vcsStateNodeRefSchema,
  vcsWalkInputSchema,
  type VcsWalkInput,
  type VcsCompareInput,
  type VcsBlameInput,
  type VcsCommitInput,
  type VcsCopyInput,
  type VcsDiscardInput,
  type VcsEditInput,
  type VcsExternalDeltaLifecycleInput,
  type VcsImportSnapshotInput,
  type VcsHistoryInput,
  type VcsInspectInput,
  type VcsListDirectoryInput,
  type VcsListFilesInput,
  type VcsMergeInput,
  type VcsMoveInput,
  type VcsNeighborsInput,
  type VcsReadFilesInput,
  type VcsRegisterExternalDeltaInput,
  type VcsReadMemoryInput,
  type VcsRevertInput,
  type VcsResolveRepositoryInput,
  type VcsSearchInput,
  type VcsSemanticNodeRef,
} from "@vibestudio/service-schemas/vcs";
import { serializeByKey } from "@vibestudio/shared/keyedSerializer";
import { createReceiverRpcMethods } from "@vibestudio/shared/rpcMethods";
import { compactId, type StateNodeRef } from "@workspace/vcs-engine";
import {
  committedWorkspaceEvent,
  createDoltWorkspaceState,
  workspaceCommitForRef,
  workspaceExternalDeltaRoots,
  workspaceHasFileContent,
  workspacePlacementRoots,
  workspacePrivateReplayContent,
  workspaceRepositoriesAt,
  workspaceTemplateInstallationAt,
} from "./doltWorkspaceState.js";
import {
  installPreparedReplayStep,
  installReplayedMain,
  type PreparedReplayStep,
} from "./legacyDoltReplay.js";
import {
  APPROVED_MAIN_GRANT_LIFETIME_MS,
  grantApprovedMain,
  grantParticipantHistory,
  historyRetirementBranch,
  type HistoryForkRequest,
  type HistoryForkSeed,
  HistoryHeadChanged,
  ParticipantHistory,
  retireParticipantHistory,
  revokeParticipantHistory,
  type HistoryCommand,
  type HistoryMutationPlan,
  type HistoryPublicationApproval,
  type MainPublication,
  type MergeSource,
} from "./participantHistory.js";
import type { WorkUnitRecord } from "./semanticVcsStore.js";
import { HistoryQueryRequestSchema, HistorySearchCauseRequestSchema, HistoryWalkCohortRequestSchema, type HistorySearchCause } from "@vibestudio/service-schemas/workspaceSource";

const source = "workers/workspace-source";
const className = "GadHistoryDO";
const canonicalKey = "canonical";
const canonicalId = `do:${source}:${className}:${canonicalKey}`;
type StoredHistoryApproval = { approval: HistoryPublicationApproval; expiresAt: number };
type ReplayContextTip = { id: string; committed: string; working: string };
type ReplayReceipt = { head: string; eventId: string; contexts: ReplayContextTip[]; frozenPlanDigest?: string };
const hostWrite = {
  principals: ["host"],
  website: {
    kind: "closed",
    reason: "Workspace history ownership and migration are managed by the host.",
  },
  effect: { kind: "open" },
  tier: "open",
  sensitivity: "write",
} as const;
const hostRead = { ...hostWrite, sensitivity: "read" } as const;

const relay = createReceiverRpcMethods<
  Pick<GadHistoryDO, "serveHistoryRemote" | "serveHistoryFork" | "archiveHistoryParticipant" | "archiveHistoryContext">
>(["serveHistoryRemote", "serveHistoryFork", "archiveHistoryParticipant", "archiveHistoryContext"]);

const participantPeerPrefix = `do:${source}:${className}:`;

function isParticipantPeer(peer: string): boolean {
  return peer.startsWith(participantPeerPrefix) &&
    /^work-[0-9a-f]{64}$/u.test(peer.slice(participantPeerPrefix.length));
}

function workKey(participantId: string): string {
  if (!participantId) throw new Error("Missing workspace participant identity");
  return `work-${sha256HexSyncText(participantId)}`;
}

interface HistoryContextBinding {
  contextId?: string;
  closed: boolean;
  targets: string[];
}

function historyContextKey(contextId: string): string {
  if (!contextId) throw new Error("Missing workspace context identity");
  return `history-context-binding:${sha256HexSyncText(contextId)}`;
}

/** The hosted, versioned history owner. The workspace's trajectory mirror lives separately. */
export class GadHistoryDO extends DurableObjectBase {
  readonly #allocations = new Map<string, Promise<unknown>>();
  #participant: ParticipantHistory | undefined;

  protected createTables(): void {
    createDoltWorkspaceState(this.sql);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS gad_history_allocations (
      target_key TEXT PRIMARY KEY,
      context_id TEXT NOT NULL,
      fork_head TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','active','retiring','archived','retired'))
    )`);
  }

  protected override requiredTables(): readonly string[] {
    return [
      "repositories",
      "files",
      "events",
      "applications",
      "commands",
      "gad_history_allocations",
    ];
  }

  @rpc(hostWrite)
  stageHistoryReplayStep(input: PreparedReplayStep): { head: string } {
    this.#assertCanonical();
    const head = this.#schemaHead();
    const sealed = this.getStateValue("history-installed") !== null;
    return { head: installPreparedReplayStep(this.ctx.storage, head, input, sealed).hash };
  }

  @rpc(hostWrite)
  finishHistoryReplay(input: Omit<ReplayReceipt, "contexts"> & { contexts?: ReplayContextTip[] }): { head: string } {
    this.#assertCanonical();
    const contexts = [...(input.contexts ?? [])].sort((left, right) => compareUtf16CodeUnits(left.id, right.id));
    const { head: proposedHead, eventId, frozenPlanDigest } = input;
    if (frozenPlanDigest !== undefined &&
        (typeof frozenPlanDigest !== "string" || !/^[0-9a-f]{64}$/u.test(frozenPlanDigest)))
      throw new Error("Workspace replay requires a valid frozen plan digest");
    const revisions = { head: proposedHead, eventId, contexts };
    const receipt = { ...revisions, ...(frozenPlanDigest === undefined ? {} : { frozenPlanDigest }) };
    const recorded = this.readHistoryReplayReceipt();
    if (recorded) {
      const { frozenPlanDigest: recordedDigest, ...recordedRevisions } = recorded;
      if (canonicalJson(recordedRevisions) !== canonicalJson(revisions) ||
          (recordedDigest && frozenPlanDigest && recordedDigest !== frozenPlanDigest)) {
        throw new Error("Workspace replay receipt names a different source or revisions");
      }
      if (frozenPlanDigest && !recordedDigest)
        this.setStateValue("history-replay-receipt", canonicalJson(receipt));
      return { head: recorded.head };
    }
    const staged = committedWorkspaceEvent(this.sql, input.head);
    if (!staged || staged.head !== input.head || staged.eventId !== input.eventId) {
      throw new Error("Workspace replay did not produce the verified main event");
    }
    const seen = new Set<string>();
    for (const { id, committed, working } of contexts) {
      if (!id || !committed || !working || seen.has(id) ||
          committedWorkspaceEvent(this.sql, working)?.head !== committed) {
        throw new Error("Workspace replay context has no verified saved and working revisions");
      }
      seen.add(id);
    }
    const head = installReplayedMain(this.ctx.storage, this.#schemaHead(), {
      main: input.head,
      contexts: [],
      commits: new Map(),
    });
    this.ctx.storage.transactionSync(() => {
      this.setStateValue("history-installed", head);
      this.setStateValue("history-replay-receipt", canonicalJson(receipt));
    });
    return { head };
  }

  @rpc(hostRead)
  supportsHistoryReplay(): boolean {
    this.#assertCanonical();
    const dolt = this.#remotes();
    if (!dolt.queryScoped) return false;
    const result = dolt.queryScoped(
      "SELECT count(*) FROM history_capability WHERE marker = 1",
      { history_capability: "SELECT 1 AS marker" },
      { maxRows: 1 }
    );
    return result.rows[0]?.[0] === 1n;
  }

  @rpc(hostRead)
  readHistoryReplayReceipt(): ReplayReceipt | null {
    this.#assertCanonical();
    const stored = this.getStateValue("history-replay-receipt");
    if (!stored) return null;
    const receipt = JSON.parse(stored) as ReplayReceipt;
    if (receipt.head !== this.getStateValue("history-installed")) {
      throw new Error("Workspace replay receipt has a different installed head");
    }
    return receipt;
  }

  @rpc(hostRead)
  readHistoryReplayPrivateContent(input: { planDigest: string; after: string | null }): string[] {
    const receipt = this.readHistoryReplayReceipt();
    if (!receipt?.frozenPlanDigest || input.planDigest !== receipt.frozenPlanDigest)
      throw new Error("Workspace replay content requires the installed frozen plan");
    if (input.after !== null && !/^[0-9a-f]{64}$/u.test(input.after))
      throw new Error("Invalid workspace replay content cursor");
    const tips = receipt.contexts.map(({ working }) => working);
    return workspacePrivateReplayContent(this.sql, tips, receipt.head, input.after ?? "", 1_024);
  }

  @rpc(hostWrite)
  registerHistoryReplayOwners(input: { owners: { contextId: string; participantId: string }[] }) {
    const receipt = this.readHistoryReplayReceipt();
    if (!receipt) throw new Error("Workspace history replay has no installed receipt");
    const contexts = new Set(receipt.contexts.map(({ id }) => id));
    const requested = new Map<string, string>();
    for (const { contextId, participantId } of input.owners) {
      if (!participantId || !contexts.has(contextId) || requested.has(contextId))
        throw new Error("Invalid workspace history replay owner");
      requested.set(contextId, participantId);
    }
    return this.ctx.storage.transactionSync(() => {
      const owners: { contextId: string; participantId: string }[] = [];
      for (const { id: contextId } of receipt.contexts) {
        const key = `history-replay-owner:${sha256HexSyncText(contextId)}`;
        const supplied = requested.get(contextId);
        const recorded = this.getStateValue(key);
        if (recorded !== null && supplied !== undefined && recorded !== supplied)
          throw new Error("Workspace history replay owner is already recorded");
        const participantId = recorded ?? supplied;
        if (participantId === undefined) continue;
        if (recorded === null) this.setStateValue(key, participantId);
        owners.push({ contextId, participantId });
      }
      return owners;
    });
  }

  /** Record a runtime lifetime before a verified participant needs a working copy. */
  @rpc(hostWrite)
  ensureHistoryRuntimeContext(input: { contextId: string }): void {
    this.#assertCanonical();
    const binding = this.#assertHistoryContextOpen(input.contextId);
    if (binding.contextId === undefined) {
      this.setStateValue(historyContextKey(input.contextId), canonicalJson({
        ...binding, contextId: input.contextId,
      }));
    }
  }

  @rpc(hostRead)
  listHistoryRuntimeContexts(input: { prefix?: string }): string[] {
    this.#assertCanonical();
    const prefix = input.prefix ?? "";
    const recorded = this.sql.exec(
      `SELECT key, value FROM state WHERE key GLOB 'history-context-binding:*'`,
    ).toArray();
    const contexts = new Map<string, boolean>();
    for (const { key, value } of recorded) {
      if (typeof value !== "string") throw new Error("Invalid workspace context registration");
      const binding = JSON.parse(value) as HistoryContextBinding;
      if (binding.contextId === undefined) continue;
      if (historyContextKey(binding.contextId) !== key)
        throw new Error("Workspace registration names a different context");
      contexts.set(binding.contextId, binding.closed);
    }
    for (const { id } of this.readHistoryReplayReceipt()?.contexts ?? []) {
      if (!contexts.has(id)) contexts.set(id, this.#historyContextBinding(id).closed);
    }
    return [...contexts].flatMap(([id, closed]) => !closed && id.startsWith(prefix) ? [id] : [])
      .sort(compareUtf16CodeUnits);
  }

  @rpc(hostWrite)
  reserveHistoryParticipant(input: { participantId: string; contextId: string; workingContextId?: string }): Promise<{
    targetId: string;
    head: string;
    origin: DoltRemoteTarget;
  }> {
    this.#assertCanonical();
    const target = workKey(input.participantId);
    const workingContextId = input.workingContextId ?? input.contextId;
    return serializeByKey(this.#allocations, target, async () => {
      let binding = this.#assertHistoryContextOpen(workingContextId);
      if (workingContextId !== input.contextId) this.#assertHistoryContextOpen(input.contextId);
      const dolt = this.#remotes();
      const main = dolt.hashOf("main");
      if (!committedWorkspaceEvent(this.sql, main))
        throw new Error("Workspace history has no installed main");
      this.sql.exec(
        `INSERT OR IGNORE INTO gad_history_allocations (target_key, context_id, fork_head) VALUES (?, ?, ?)`,
        target,
        input.contextId,
        main
      );
      const stored = this.sql
        .exec(
          "SELECT context_id, fork_head, status FROM gad_history_allocations WHERE target_key = ?",
          target
        )
        .one();
      if (stored["context_id"] !== input.contextId || typeof stored["fork_head"] !== "string") {
        throw new Error("Workspace participant allocation changed its owner context");
      }
      const forkHead = stored["fork_head"];
      if (stored["status"] !== "reserved" && stored["status"] !== "active") {
        throw new Error("Workspace participant is retiring");
      }
      const identityKey = `history-allocation-identity:${target}`;
      const previousIdentity = this.getStateValue(identityKey);
      if (previousIdentity !== null && previousIdentity !== input.participantId) {
        throw new Error("Workspace participant allocation changed its identity");
      }
      if (previousIdentity === null) this.setStateValue(identityKey, input.participantId);
      const targetId = `do:${source}:${className}:${target}`;
      if (stored["status"] === "reserved") {
        const sourceRef = this.env["WORKER_SOURCE_REF"];
        const handle = await this.rpc.call("main", mainRpcMethods["runtime.createEntity"], [
          {
            kind: "do",
            className,
            key: target,
            // This cell owns a storage copy. The host admits and binds the
            // participant's logical context separately; the runtime inherits
            // this history service's context for the physical storage entity.
            execution: {
              surface: "code",
              source,
              ...(typeof sourceRef === "string" ? { ref: sourceRef } : {}),
            },
            forkStorage: { at: forkHead },
          },
        ]);
        if (handle.targetId !== targetId) {
          throw new Error("Runtime returned a different workspace participant allocation");
        }
        this.#setAllocationStatus(target, "active");
        binding = this.#assertHistoryContextOpen(workingContextId);
        if (workingContextId !== input.contextId) this.#assertHistoryContextOpen(input.contextId);
      }
      if (!binding.targets.includes(target)) {
        binding.targets.push(target);
        binding.targets.sort();
        this.setStateValue(historyContextKey(workingContextId), canonicalJson({ ...binding, contextId: workingContextId }));
      }
      const receiptKey = `history-origin:${target}`;
      const storedGrant = this.getStateValue(receiptKey);
      let receipt: { id: string; token: string } | null = storedGrant === null
        ? null
        : JSON.parse(storedGrant) as { id: string; token: string };
      if (!receipt || !dolt.remote.grants().some((grant) => grant.id === receipt?.id && grant.peer === targetId)) {
        const grant = grantParticipantHistory(dolt, input.participantId, targetId);
        for (const prior of dolt.remote.grants()) {
          if (prior.id !== grant.id && prior.label === grant.label && prior.peer === targetId) {
            dolt.remote.revoke(prior.id);
          }
        }
        receipt = { id: grant.id, token: grant.token };
        this.setStateValue(receiptKey, canonicalJson(receipt));
      }
      return {
        targetId,
        head: forkHead,
        origin: { ref: `${className}:${canonicalKey}`, token: receipt.token },
      };
    });
  }

  @rpc(hostWrite)
  async connectHistoryParticipant(input: {
    participantId: string;
    origin: DoltRemoteTarget;
  }): Promise<string> {
    this.#recordHistoryOrigin(input);
    return this.#history().connect(input.origin);
  }

  @rpc(hostWrite)
  bindHistoryContext(input: {
    participantId: string;
    origin: DoltRemoteTarget;
    contextId: string;
    replayedHead?: string;
  }): Promise<string> {
    this.#recordHistoryOrigin(input);
    return this.#history().bindContext(input.contextId, input.origin, input.replayedHead);
  }

  @rpc(hostWrite)
  async offerHistoryContextFork(input: HistoryForkRequest) {
    this.#assertWritable();
    if (!isParticipantPeer(input.childPeer))
      throw new Error("Workspace fork requires an allocated storage peer");
    const { seed, grant } = await this.#history().offerContextFork(
      input, input.childPeer === `${participantPeerPrefix}${this.objectKey}`,
    );
    return {
      seed,
      token: grant?.token ?? null,
    };
  }

  @rpc(hostWrite)
  acceptHistoryContextFork(input: {
    participantId: string;
    origin: DoltRemoteTarget;
    request: HistoryForkRequest;
    seed: HistoryForkSeed;
    fromPeer: string;
    token: string | null;
  }): Promise<HistoryForkSeed> {
    if (input.request.childPeer !== `${participantPeerPrefix}${this.objectKey}` ||
      !isParticipantPeer(input.fromPeer)) {
      throw new Error("Workspace fork has a different storage peer");
    }
    this.#recordHistoryOrigin(input);
    const peer = input.fromPeer;
    return this.#history().adoptContextFork({
      request: input.request,
      seed: input.seed,
      source: peer,
      origin: input.token === null ? null : {
        ref: `${className}:${peer.slice(participantPeerPrefix.length)}`, token: input.token,
      },
      transport: (bytes) => this.rpc.call(peer, relay.serveHistoryFork, [bytes]),
      local: peer === input.request.childPeer,
    });
  }

  @rpc(hostWrite)
  finishHistoryContextFork(input: { request: HistoryForkRequest; seed: HistoryForkSeed }): Promise<void> {
    this.#assertWritable();
    return this.#history().finishContextFork(input.request, input.seed);
  }

  @rpc({ ...hostRead, principals: ["code"], codeOnly: true })
  serveHistoryFork(bytes: Uint8Array): Uint8Array {
    this.#assertWritable();
    this.#history();
    const peer = this.rpcCallerId;
    const request = rpcBytesOf(bytes);
    if (!peer || !isParticipantPeer(peer) || !request)
      throw new Error("Workspace fork remote requires a storage peer");
    return this.#remotes().remote.serve(request, { peer });
  }

  #recordHistoryOrigin(input: { participantId: string; origin: DoltRemoteTarget }): void {
    this.ensureReady();
    if (
      this.objectKey !== workKey(input.participantId) ||
      input.origin.ref !== `${className}:${canonicalKey}`
    ) {
      throw new Error("Workspace history origin does not match the participant allocation");
    }
    this.#assertWritable();
    const prior = this.getStateValue("history-participant");
    if (prior !== null && prior !== input.participantId) {
      throw new Error("Workspace participant has a different recorded owner");
    }
    if (prior === null) this.setStateValue("history-participant", input.participantId);
  }

  @rpc(hostWrite)
  openHistoryContext(input: { contextId: string; head: string }): Promise<string> {
    this.#assertWritable();
    return this.#history().openContext(input.contextId, input.head);
  }

  @rpc(hostRead)
  readHistoryContext(input: { contextId: string; state: StateNodeRef }) {
    return this.#history().materialization(input.contextId, input.state);
  }

  @rpc(hostRead)
  readHistoryProjection(input: { contextId: string }) {
    return this.#history().projection(input.contextId);
  }

  @rpc(hostWrite)
  rememberHistoryContentSource(input: { contextId: string; stateHash: string; state: StateNodeRef }) {
    this.#assertWritable();
    return this.#history().rememberContentSource(input.contextId, input.stateHash, vcsStateNodeRefSchema.parse(input.state));
  }

  @rpc(hostRead)
  readHistoryContentSource(input: { contextId: string; stateHash: string; readableContextIds?: string[] }) {
    return this.#history().contentSource(
      [input.contextId, ...(input.readableContextIds ?? [])], input.stateHash,
    );
  }

  @rpc(hostRead)
  readHistoryStatus(input: { contextId: string }) {
    return this.#history().status(input.contextId);
  }

  @rpc(hostRead)
  readHistoryFiles(input: { contextId: string; read: VcsReadFilesInput }) {
    return this.#history().readFiles(input.contextId, vcsReadFilesInputSchema.parse(input.read));
  }

  @rpc(hostRead)
  listHistoryFiles(input: { contextId: string; list: VcsListFilesInput }) {
    return this.#history().listFiles(input.contextId, vcsListFilesInputSchema.parse(input.list));
  }

  @rpc(hostRead)
  listHistoryDirectory(input: { contextId: string; list: VcsListDirectoryInput }) {
    return this.#history().listDirectory(input.contextId, vcsListDirectoryInputSchema.parse(input.list));
  }

  @rpc(hostRead)
  resolveHistoryRepository(input: { contextId: string; repository: VcsResolveRepositoryInput }) {
    return this.#history().resolveRepository(input.contextId, vcsResolveRepositoryInputSchema.parse(input.repository));
  }

  @rpc(hostRead)
  readHistoryRepositoryLocation(input: { contextId: string; state: StateNodeRef; repositoryId: string }) {
    const node = vcsSemanticNodeRefSchema.parse({
      kind: "repository", state: input.state, repositoryId: input.repositoryId,
    });
    if (node.kind !== "repository") throw new Error("Workspace repository location requires a repository");
    return this.#history().repositoryLocation(input.contextId, node.state, node.repositoryId);
  }

  @rpc(hostRead)
  readHistoryChangedLocations(input: { contextId: string; target: StateNodeRef; source: StateNodeRef }) {
    return this.#history().changedLocations(
      input.contextId, vcsStateNodeRefSchema.parse(input.target), vcsStateNodeRefSchema.parse(input.source),
    );
  }

  @rpc(hostRead)
  readHistoryReferenceVisibility(input: { contextIds: string[]; references: VcsSemanticNodeRef[] }) {
    return this.#history().referencesReachable(
      input.contextIds,
      input.references.map((reference) => vcsSemanticNodeRefSchema.parse(reference)),
    );
  }

  @rpc(hostRead)
  readHistoryReferenceContext(input: { contextIds: string[]; reference: VcsSemanticNodeRef }) {
    return this.#history().contextForReference(input.contextIds, vcsSemanticNodeRefSchema.parse(input.reference));
  }

  @rpc(hostRead)
  inspectHistoryNode(input: { contextId: string; inspect: VcsInspectInput }) {
    return this.#history().inspect(input.contextId, this.#workspaceId(), vcsInspectInputSchema.parse(input.inspect));
  }

  @rpc(hostRead)
  readHistoryNeighbors(input: { contextId: string; neighbors: VcsNeighborsInput }) {
    return this.#history().neighbors(input.contextId, this.#workspaceId(), vcsNeighborsInputSchema.parse(input.neighbors));
  }

  @rpc(hostRead)
  readHistoryTimeline(input: { contextId: string; history: VcsHistoryInput }) {
    return this.#history().history(input.contextId, this.#workspaceId(), vcsHistoryInputSchema.parse(input.history));
  }

  @rpc(hostRead)
  searchHistory(input: { search: VcsSearchInput; protectedEventId: string }) {
    return this.#history().search(vcsSearchInputSchema.parse(input.search), input.protectedEventId);
  }

  @rpc(hostRead)
  readHistoryWalk(input: { walk: VcsWalkInput; protectedEventId: string }) {
    return this.#history().walk(this.#workspaceId(), vcsWalkInputSchema.parse(input.walk), input.protectedEventId);
  }

  @rpc(hostRead)
  readHistoryWalkCohort(input: ReturnType<typeof HistoryWalkCohortRequestSchema.parse>) {
    const { walk, revisions, seed, invocations } = HistoryWalkCohortRequestSchema.parse(input);
    return this.#history().walkCohort(walk, revisions, seed, invocations);
  }

  @rpc(hostRead)
  readHistoryQueryBasis(input: { query: VcsQueryInput; protectedEventId: string }) {
    return this.#history().queryBasis(vcsQueryInputSchema.parse(input.query), input.protectedEventId);
  }

  @rpc(hostRead)
  readHistoryQuery(input: ReturnType<typeof HistoryQueryRequestSchema.parse>) {
    const { query, basis, trajectory } = HistoryQueryRequestSchema.parse(input);
    return this.#history().query(query, basis, trajectory);
  }

  @rpc(hostRead)
  readHistorySearchCauses(input: { revision: string; after: HistorySearchCause | null }) {
    const { revision, after } = HistorySearchCauseRequestSchema.parse(input);
    return this.#history().searchCausesAt(revision, after);
  }

  @rpc(hostRead)
  readHistoryBlame(input: { contextId: string; blame: VcsBlameInput }) {
    return this.#history().blame(input.contextId, vcsBlameInputSchema.parse(input.blame));
  }

  @rpc(hostRead)
  readHistoryMemory(input: VcsReadMemoryInput) {
    return this.#history().readMemory(this.#workspaceId(), vcsReadMemoryInputSchema.parse(input));
  }

  #workspaceId(): string {
    const workspaceId = this.env["WORKSPACE_ID"];
    if (typeof workspaceId !== "string" || !workspaceId) throw new Error("Workspace history has no workspace identity");
    return workspaceId;
  }

  @rpc(hostRead)
  listHistoryRetainedParticipants(): string[] {
    this.#assertCanonical();
    return this.sql.exec(
      `SELECT target_key FROM gad_history_allocations
        WHERE status IN ('active', 'retiring') ORDER BY target_key`,
    ).toArray().map(({ target_key }) => {
      if (typeof target_key !== "string" || !/^work-[0-9a-f]{64}$/u.test(target_key)) {
        throw new Error("Workspace history has an invalid retained participant");
      }
      return target_key;
    });
  }

  @rpc(hostRead)
  async hasHistoryFileContent(input: {
    contentHash: string;
    scope: { kind: "published"; expectedEventId: string } | { kind: "context"; contextId: string };
  }): Promise<boolean> {
    if (!/^[a-f0-9]{64}$/u.test(input.contentHash)) throw new Error("Invalid workspace content digest");
    if (input.scope.kind === "context")
      return this.#history().hasFileContent(input.scope.contextId, input.contentHash);
    this.#assertCanonical();
    const main = this.#remotes().hashOf("main");
    const event = committedWorkspaceEvent(this.sql, main);
    return event?.head === main && event.eventId === input.scope.expectedEventId &&
      workspaceHasFileContent(this.sql, main, input.contentHash);
  }

  @rpc(hostRead)
  readHistoryContentRoots(): string[] {
    this.ensureReady();
    const heads = this.#remotes().branch.list().map(({ hash }) => hash);
    return [...new Set([
      ...workspacePlacementRoots(this.sql, heads),
      ...workspaceExternalDeltaRoots(this.sql, heads),
    ])].sort(compareUtf16CodeUnits);
  }

  @rpc(hostRead)
  async readHistoryContentOrigins(input: {
    contextId: string;
    state: StateNodeRef;
    fileIds: string[];
  }) {
    const origins = await this.#history().contentOrigins(input.contextId, input.state, input.fileIds);
    return [...origins].map(([fileId, origin]) => ({ fileId, origin }));
  }

  @rpc(hostRead)
  readHistoryHeads(input: { contextId: string }) {
    return this.#history().contextHeads(input.contextId);
  }

  @rpc(hostRead)
  readHistoryMain() {
    this.#assertCanonical();
    const head = this.#remotes().hashOf("main");
    const main = committedWorkspaceEvent(this.sql, head);
    if (main?.head !== head) throw new Error("Workspace main is missing its committed event");
    return main;
  }

  @rpc(hostRead)
  readHistoryMainStateVisibility(input: { state: StateNodeRef; expectedEventId?: string }): boolean {
    this.#assertCanonical();
    const main = this.#remotes().hashOf("main");
    if (input.expectedEventId !== undefined) {
      const event = committedWorkspaceEvent(this.sql, main);
      if (event?.head !== main || event.eventId !== input.expectedEventId) return false;
    }
    return workspaceCommitForRef(
      this.sql, main, vcsStateNodeRefSchema.parse(input.state),
    ) !== null;
  }

  @rpc(hostRead)
  readHistoryTemplateInstallation(input: { eventId: string }) {
    this.#assertCanonical();
    const main = this.#remotes().hashOf("main");
    const state = vcsStateNodeRefSchema.parse({ kind: "event", eventId: input.eventId });
    const revision = workspaceCommitForRef(this.sql, main, state);
    if (!revision) throw new Error("Workspace event is outside canonical history");
    return workspaceTemplateInstallationAt(this.sql, revision);
  }

  @rpc(hostRead)
  readHistoryPublishedRevision(input: { eventId: string }) {
    this.#assertCanonical();
    const main = this.#remotes().hashOf("main");
    const state = { kind: "event" as const, eventId: input.eventId };
    const head = workspaceCommitForRef(this.sql, main, state);
    if (!head) throw new Error("Workspace event is outside canonical history");
    return { head, state, repositories: workspaceRepositoriesAt(this.sql, head) };
  }

  @rpc(hostRead)
  planHistoryEdit(input: {
    head: string;
    edit: VcsEditInput;
    cause: HistoryCommand["cause"];
    receipt: Record<string, unknown> | null;
    triggerEvidence?: WorkUnitRecord["triggerEvidence"];
  }): Promise<HistoryMutationPlan> {
    this.#assertWritable();
    const edit = vcsEditInputSchema.parse(input.edit);
    return this.#history().planEdit(
      input.head,
      edit,
      {
        commandId: edit.commandId,
        method: "edit",
        requestDigest: compactId("edit-request", edit),
        cause: input.cause,
      },
      input.receipt,
      input.triggerEvidence,
    );
  }

  @rpc(hostWrite)
  planHistoryTransfer(input: {
    head: string;
    transfer: { method: "move"; value: VcsMoveInput } | { method: "copy"; value: VcsCopyInput };
    cause: HistoryCommand["cause"];
    readableContextIds?: string[];
    triggerEvidence?: WorkUnitRecord["triggerEvidence"];
  }): Promise<HistoryMutationPlan> {
    this.#assertWritable();
    if (input.transfer.method !== "move" && input.transfer.method !== "copy") {
      throw new Error("Workspace transfer method is invalid");
    }
    const transfer = input.transfer.method === "move"
      ? { method: "move" as const, value: vcsMoveInputSchema.parse(input.transfer.value) }
      : { method: "copy" as const, value: vcsCopyInputSchema.parse(input.transfer.value) };
    return this.#history().planTransfer(
      input.head, transfer, input.cause, input.triggerEvidence, input.readableContextIds,
    );
  }

  @rpc(hostWrite)
  planHistoryRevert(input: {
    head: string;
    revert: VcsRevertInput;
    cause: HistoryCommand["cause"];
    triggerEvidence?: WorkUnitRecord["triggerEvidence"];
  }): Promise<HistoryMutationPlan> {
    this.#assertWritable();
    return this.#history().planRevert(
      input.head, vcsRevertInputSchema.parse(input.revert), input.cause, input.triggerEvidence,
    );
  }

  @rpc(hostWrite)
  importHistorySnapshot(input: {
    head: string;
    snapshot: VcsImportSnapshotInput;
    observation: Record<string, unknown>;
    cause: HistoryCommand["cause"];
    triggerEvidence?: WorkUnitRecord["triggerEvidence"];
  }) {
    this.#assertWritable();
    return this.#history().importSnapshot(
      input.head, vcsImportSnapshotInputSchema.parse(input.snapshot), input.observation,
      input.cause, input.triggerEvidence,
    );
  }

  @rpc(hostWrite)
  registerHistoryExternalDelta(input: {
    head: string;
    delta: VcsRegisterExternalDeltaInput;
    observation: Record<string, unknown>;
    cause: HistoryCommand["cause"];
    triggerEvidence?: WorkUnitRecord["triggerEvidence"];
  }) {
    this.#assertWritable();
    return this.#history().registerExternalDelta(
      input.head, vcsRegisterExternalDeltaInputSchema.parse(input.delta), input.observation,
      input.cause, input.triggerEvidence,
    );
  }

  @rpc(hostWrite)
  setHistoryExternalDeltaStatus(input: {
    head: string;
    delta: VcsExternalDeltaLifecycleInput;
    cause: HistoryCommand["cause"];
    status: "superseded" | "finalized";
  }) {
    this.#assertWritable();
    if (input.status !== "superseded" && input.status !== "finalized") throw new Error("Invalid external delta status");
    return this.#history().setExternalDeltaStatus(
      input.head, vcsExternalDeltaLifecycleInputSchema.parse(input.delta), input.cause, input.status,
    );
  }

  @rpc(hostWrite)
  applyHistoryApplication(input: {
    head: string;
    command: Parameters<ParticipantHistory["applyApplication"]>[1];
    plan: Parameters<ParticipantHistory["applyApplication"]>[2];
  }) {
    this.#assertWritable();
    return this.#history().applyApplication(input.head, input.command, input.plan);
  }

  @rpc(hostWrite)
  saveHistoryContext(input: {
    head: string;
    commit: VcsCommitInput;
    cause: HistoryCommand["cause"];
  }) {
    this.#assertWritable();
    return this.#history().saveContext(input.head, vcsCommitInputSchema.parse(input.commit), input.cause);
  }

  @rpc(hostRead)
  hasHistoryDiscardReceipt(input: { discard: VcsDiscardInput; cause: HistoryCommand["cause"] }) {
    return this.#history().hasDiscardReceipt(vcsDiscardInputSchema.parse(input.discard), input.cause);
  }

  @rpc(hostWrite)
  discardHistoryContext(input: {
    head: string;
    discard: VcsDiscardInput;
    cause: HistoryCommand["cause"];
  }) {
    this.#assertWritable();
    return this.#history().discardWorkingContext(input.head, vcsDiscardInputSchema.parse(input.discard), input.cause);
  }

  @rpc(hostWrite)
  pullHistoryMain(input: { contextId: string; head: string; main: string }) {
    this.#assertWritable();
    return this.#history().pullMain(input.contextId, input.head, input.main);
  }

  @rpc(hostRead)
  previewHistoryMainMerge(input: { contextId: string; head: string; main: string }) {
    return this.#history().previewMainMerge(input.contextId, input.head, input.main);
  }

  @rpc(hostRead)
  resolveHistoryMerge(input: {
    contextId: string; target: StateNodeRef; source: StateNodeRef; readableContextIds: string[];
  }) {
    return this.#history().resolveMerge(
      input.contextId, vcsStateNodeRefSchema.parse(input.target), vcsStateNodeRefSchema.parse(input.source),
      input.readableContextIds,
    );
  }

  @rpc(hostRead)
  reviewHistoryMerge(input: {
    contextId: string;
    compare: VcsCompareInput;
    readableContextIds: string[];
    observation?: Parameters<ParticipantHistory["reviewMerge"]>[3];
  }) {
    return this.#history().reviewMerge(
      input.contextId, vcsCompareInputSchema.parse(input.compare), input.readableContextIds, input.observation ?? null,
    );
  }

  @rpc(hostRead)
  readHistoryMergeLocations(input: {
    contextId: string; target: StateNodeRef; source: StateNodeRef; readableContextIds: string[];
  }) {
    return this.#history().mergeLocations(
      input.contextId, vcsStateNodeRefSchema.parse(input.target), vcsStateNodeRefSchema.parse(input.source),
      input.readableContextIds,
    );
  }

  @rpc(hostRead)
  previewHistoryContextMerge(input: { contextId: string; head: string; source: MergeSource }) {
    return this.#history().previewContextMerge(input.contextId, input.head, input.source);
  }

  @rpc(hostWrite)
  mergeHistoryExternalDelta(input: {
    merge: VcsMergeInput;
    cause: HistoryCommand["cause"];
    triggerEvidence?: WorkUnitRecord["triggerEvidence"];
    content?: Parameters<ParticipantHistory["mergeExternal"]>[3];
  }) {
    this.#assertWritable();
    return this.#history().mergeExternal(vcsMergeInputSchema.parse(input.merge), input.cause, input.triggerEvidence, input.content);
  }

  @rpc(hostWrite)
  mergeHistoryMain(input: {
    head: string;
    base: string;
    main: string;
    merge: VcsMergeInput;
    cause: HistoryCommand["cause"];
    triggerEvidence?: WorkUnitRecord["triggerEvidence"];
    content?: Parameters<ParticipantHistory["mergeReviewedMain"]>[4];
  }) {
    this.#assertWritable();
    return this.#history().mergeReviewedMain(
      { head: input.head, base: input.base, main: input.main },
      vcsMergeInputSchema.parse(input.merge),
      input.cause,
      input.triggerEvidence,
      input.content,
    );
  }

  @rpc(hostWrite)
  mergeHistoryContext(input: {
    head: string;
    base: string;
    source: MergeSource;
    merge: VcsMergeInput;
    cause: HistoryCommand["cause"];
    triggerEvidence?: WorkUnitRecord["triggerEvidence"];
    content?: Parameters<ParticipantHistory["mergeReviewedContext"]>[5];
  }) {
    this.#assertWritable();
    return this.#history().mergeReviewedContext(
      { head: input.head, base: input.base },
      input.source,
      vcsMergeInputSchema.parse(input.merge),
      input.cause,
      input.triggerEvidence,
      input.content,
    );
  }

  @rpc(hostWrite)
  async publishHistoryContext(input: { contextId: string; head: string }) {
    const history = this.#history();
    await this.#assertSaved(history, input.contextId, input.head);
    this.#assertWritable();
    return history.publishContext(input.contextId, input.head);
  }

  /** Called after the existing host gate prepares the exact publication. */
  @rpc(hostWrite)
  authorizeHistoryPublication(approval: HistoryPublicationApproval): { expiresAt: number } {
    this.#assertCanonical();
    if (!approval.publicationId || !approval.previousEventId || !approval.proposedEventId) {
      throw new Error("Workspace publication requires exact approval evidence");
    }
    if (approval.publication.previousHead === approval.publication.proposedHead) {
      throw new Error("Workspace publication must advance main");
    }
    const key = this.#approvalKey(approval.publicationId);
    const previous = this.#storedApproval(approval.publicationId);
    if (previous && canonicalJson(previous.approval) !== canonicalJson(approval)) {
      throw new Error("Workspace publication approval changed");
    }
    if (previous && (previous.expiresAt > Date.now() || this.#publishedApproval(approval))) {
      return { expiresAt: previous.expiresAt };
    }
    const target = workKey(approval.participantId);
    if (this.#allocationStatus(target) !== "active")
      throw new Error("Workspace participant has no active history allocation");
    const main = this.readHistoryMain();
    if (main.head !== approval.publication.previousHead) {
      throw new HistoryHeadChanged(approval.publication.previousHead, main.head);
    }
    if (main.eventId !== approval.previousEventId) {
      throw new Error("Workspace publication approval names a different base event");
    }
    const expiresAt = Date.now() + APPROVED_MAIN_GRANT_LIFETIME_MS;
    this.setStateValue(key, canonicalJson({ approval, expiresAt } satisfies StoredHistoryApproval));
    return { expiresAt };
  }

  @rpc(hostWrite)
  grantHistoryPublication(input: { publicationId: string }) {
    this.#assertCanonical();
    const receipt = this.#storedApproval(input.publicationId);
    if (!receipt) throw new Error("Workspace publication has no durable approval");
    const { approval, expiresAt } = receipt;
    if (this.#publishedApproval(approval)) {
      return { kind: "applied" as const, head: approval.publication.proposedHead };
    }
    if (expiresAt <= Date.now()) throw new Error("Workspace publication approval expired");
    const target = workKey(approval.participantId);
    if (this.#allocationStatus(target) !== "active")
      throw new Error("Workspace participant has no active history allocation");
    const grant = grantApprovedMain(
      this.#remotes(),
      approval.publication,
      `do:${source}:${className}:${target}`,
      expiresAt
    );
    return {
      kind: "grant" as const,
      id: grant.id,
      origin: { ref: `${className}:${canonicalKey}`, token: grant.token },
    };
  }

  @rpc(hostRead)
  readHistoryPublicationApproval(input: { publicationId: string }) {
    this.#assertCanonical();
    const receipt = this.#storedApproval(input.publicationId);
    return receipt === null ? null : {
      ...receipt,
      applied: this.#publishedApproval(receipt.approval),
    };
  }

  @rpc(hostRead)
  listHistoryAppliedPublications() {
    this.#assertCanonical();
    return this.sql.exec(
      "SELECT value FROM state WHERE key LIKE 'history-publication:%' ORDER BY key"
    ).toArray().flatMap((row) => {
      const receipt = JSON.parse(String(row["value"])) as StoredHistoryApproval;
      return this.#publishedApproval(receipt.approval) ? [{ ...receipt, applied: true as const }] : [];
    });
  }

  @rpc(hostWrite)
  acknowledgeHistoryPublication(input: { publicationId: string }): void {
    this.#assertCanonical();
    const receipt = this.#storedApproval(input.publicationId);
    if (!receipt) return;
    if (!this.#publishedApproval(receipt.approval)) {
      throw new Error("Workspace publication has no applied revision");
    }
    this.deleteStateValue(this.#approvalKey(input.publicationId));
  }

  @rpc(hostWrite)
  async publishApprovedHistory(input: {
    contextId: string;
    publication: MainPublication;
    proposedEventId: string;
    origin: DoltRemoteTarget;
  }) {
    const history = this.#history();
    const saved = await this.#assertSaved(history, input.contextId, input.publication.proposedHead);
    if (saved.eventId !== input.proposedEventId) {
      throw new Error("Workspace publication names a different saved event");
    }
    this.#assertWritable();
    return history.publishApprovedMain(input.contextId, input.publication, input.origin);
  }

  @rpc(hostWrite)
  releaseHistoryGrant(input: { id: string }): void {
    this.#assertCanonical();
    const remote = this.#remotes().remote;
    if (remote.grants().some((grant) => grant.id === input.id)) remote.revoke(input.id);
  }

  @rpc(hostWrite)
  retireHistoryParticipant(input: { participantId: string }): Promise<void> {
    this.#assertCanonical();
    const target = workKey(input.participantId);
    const peer = `do:${source}:${className}:${target}`;
    return serializeByKey(this.#allocations, target, async () => {
      const status = this.#allocationStatus(target);
      if (status === undefined || status === "retired") return;
      const dolt = this.#remotes();
      const destroy = async () => {
        this.deleteStateValue(`history-origin:${target}`);
        await this.rpc.call("main", mainRpcMethods["runtime.retireEntity"], [{ id: peer }]);
        this.#setAllocationStatus(target, "retired");
      };
      if (status === "reserved" || status === "archived") {
        this.#setAllocationStatus(target, "archived");
        revokeParticipantHistory(dolt, input.participantId, peer);
        await destroy();
        return;
      }
      this.#setAllocationStatus(target, "retiring");
      await retireParticipantHistory(
        dolt,
        input.participantId,
        async (token, main) => {
          await this.rpc.call(peer, relay.archiveHistoryParticipant, [
            { main, origin: { ref: `${className}:${canonicalKey}`, token } },
          ]);
          this.#setAllocationStatus(target, "archived");
        },
        destroy,
        peer
      );
    });
  }

  /** The host has joined the logical context before retiring its storage owners. */
  @rpc(hostWrite)
  async retireHistoryContext(input: { contextId: string }) {
    this.#assertCanonical();
    const binding = this.#historyContextBinding(input.contextId);
    if (!binding.closed) {
      binding.closed = true;
      this.setStateValue(historyContextKey(input.contextId), canonicalJson({ ...binding, contextId: input.contextId }));
    }
    const rows = this.sql.exec(
      "SELECT target_key, status FROM gad_history_allocations WHERE context_id = ? ORDER BY target_key",
      input.contextId,
    ).toArray();
    const members = rows.map(({ target_key, status }) => {
      if (typeof target_key !== "string") throw new Error("Invalid workspace participant allocation");
      const participantId = this.getStateValue(`history-allocation-identity:${target_key}`);
      if (status !== "retired" && (!participantId || workKey(participantId) !== target_key)) {
        throw new Error("Workspace retirement has no verified participant identity");
      }
      return { target: target_key, participantId, retired: status === "retired" };
    });
    for (const { participantId, retired } of members) {
      if (!retired && participantId) await this.retireHistoryParticipant({ participantId });
    }
    const targets = members.map(({ target }) => target);
    const fullOwners = new Set(targets);
    const branchOwners = binding.targets.filter((target) => !fullOwners.has(target));
    for (const target of branchOwners) {
      await serializeByKey(this.#allocations, target, async () => {
        const status = this.#allocationStatus(target);
        if (status === "archived" || status === "retired" || status === "retiring") return;
        const participantId = this.getStateValue(`history-allocation-identity:${target}`);
        if (status !== "active" || !participantId || workKey(participantId) !== target)
          throw new Error("Workspace context retirement has no verified storage owner");
        const peer = `${participantPeerPrefix}${target}`;
        const dolt = this.#remotes();
        const branch = historyRetirementBranch(participantId, input.contextId);
        const label = `context-retirement:${sha256HexSyncText(branch)}`;
        for (const prior of dolt.remote.grants()) {
          if (prior.label === label) dolt.remote.revoke(prior.id);
        }
        const grant = dolt.remote.grant({ label, peer, fetch: true, branches: ["main"], push: [branch] });
        try {
          await this.rpc.call(peer, relay.archiveHistoryContext, [{
            contextId: input.contextId,
            participantId,
            main: dolt.hashOf("main"),
            origin: { ref: `${className}:${canonicalKey}`, token: grant.token },
          }]);
        } finally {
          dolt.remote.revoke(grant.id);
        }
      });
    }
    return { contextId: input.contextId, targets, branchOwners };
  }

  #historyContextBinding(contextId: string): HistoryContextBinding {
    const stored = this.getStateValue(historyContextKey(contextId));
    if (stored === null) return { closed: false, targets: [] };
    const binding = JSON.parse(stored) as HistoryContextBinding;
    if (binding.contextId !== undefined && binding.contextId !== contextId)
      throw new Error("Workspace registration names a different context");
    return binding;
  }

  #assertHistoryContextOpen(contextId: string): HistoryContextBinding {
    const binding = this.#historyContextBinding(contextId);
    if (binding.closed) throw new Error("Workspace participant context has retired");
    return binding;
  }

  @rpc({ ...hostWrite, principals: ["code"], codeOnly: true })
  archiveHistoryContext(input: {
    contextId: string;
    participantId: string;
    main: string;
    origin: DoltRemoteTarget;
  }): Promise<void> {
    if (this.rpcCallerId !== canonicalId)
      throw new Error("Workspace context retirement requires its canonical owner");
    this.#recordHistoryOrigin(input);
    return this.#history().retireContext(input.contextId, input.main, input.origin);
  }

  @rpc({ ...hostWrite, principals: ["code"], codeOnly: true })
  async archiveHistoryParticipant(input: {
    main: string;
    origin: DoltRemoteTarget;
  }): Promise<void> {
    if (this.rpcCallerId !== canonicalId)
      throw new Error("Workspace retirement requires its canonical owner");
    this.ensureReady();
    this.setStateValue("history-retiring", "true");
    if (this.getStateValue("history-participant") !== null) {
      await this.#history().archiveAllCommittedContexts(input.main, input.origin);
    }
  }

  async #assertSaved(
    history: ParticipantHistory,
    contextId: string,
    expectedHead: string
  ): Promise<{ head: string; eventId: string }> {
    const { committed, workingHead } = await history.contextHeads(contextId);
    if (committed.head !== expectedHead || workingHead !== expectedHead) {
      throw new Error("Workspace publication requires the exact saved revision");
    }
    return committed;
  }

  @rpc({ ...hostWrite, principals: ["code"], codeOnly: true })
  serveHistoryRemote(bytes: Uint8Array): Uint8Array {
    this.#assertCanonical();
    const prefix = `do:${source}:${className}:`;
    const caller = this.rpcCallerId;
    const status = caller?.startsWith(prefix)
      ? this.#allocationStatus(caller.slice(prefix.length))
      : undefined;
    if (!caller || (status !== "active" && status !== "retiring")) {
      throw new Error("Workspace history remote requires an allocated participant");
    }
    const request = rpcBytesOf(bytes);
    if (!request) throw new Error("Invalid workspace history remote request");
    return this.#remotes().remote.serve(request, { peer: caller });
  }

  #assertCanonical(): void {
    this.ensureReady();
    if (this.objectKey !== canonicalKey)
      throw new Error("Only the canonical workspace history owns this operation");
  }

  #allocationStatus(target: string): unknown {
    return this.sql
      .exec("SELECT status FROM gad_history_allocations WHERE target_key = ?", target)
      .toArray()[0]?.["status"];
  }

  #approvalKey(publicationId: string): string {
    return `history-publication:${sha256HexSyncText(publicationId)}`;
  }

  #storedApproval(publicationId: string): StoredHistoryApproval | null {
    const stored = this.getStateValue(this.#approvalKey(publicationId));
    return stored === null ? null : JSON.parse(stored) as StoredHistoryApproval;
  }

  #publishedApproval(approval: HistoryPublicationApproval): boolean {
    const main = this.#remotes().hashOf("main");
    return workspaceCommitForRef(this.sql, main, { kind: "event", eventId: approval.proposedEventId })
      === approval.publication.proposedHead;
  }

  #setAllocationStatus(target: string, status: "active" | "retiring" | "archived" | "retired"): void {
    this.sql.exec("UPDATE gad_history_allocations SET status = ? WHERE target_key = ?", status, target);
  }

  #assertWritable(): void {
    this.ensureReady();
    if (this.getStateValue("history-retiring") !== null)
      throw new Error("Workspace participant is retiring");
  }

  #schemaHead(): string {
    const existing = this.getStateValue("history-schema-head");
    if (existing) return existing;
    const head = this.#remotes().hashOf("main");
    this.setStateValue("history-schema-head", head);
    return head;
  }

  #remotes() {
    const dolt = doltRemotesOf(this.ctx.storage);
    if (!dolt) throw new Error("Hosted workspace history requires Dolt remotes");
    return dolt;
  }

  #history(): ParticipantHistory {
    this.ensureReady();
    const participant = this.getStateValue("history-participant");
    if (!participant || this.objectKey !== workKey(participant))
      throw new Error("Workspace participant has no connected history");
    return (this.#participant ??= new ParticipantHistory(
      participant,
      this.ctx.storage,
      (bytes) => this.rpc.call(canonicalId, relay.serveHistoryRemote, [bytes]),
      {
        get: (key) => this.getStateValue(key),
        set: (key, value) => this.setStateValue(key, value),
        delete: (key) => this.deleteStateValue(key),
      },
    ));
  }
}
