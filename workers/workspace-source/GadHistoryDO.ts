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
  vcsHistoryInputSchema,
  vcsInspectInputSchema,
  vcsListDirectoryInputSchema,
  vcsListFilesInputSchema,
  vcsMergeInputSchema,
  vcsMoveInputSchema,
  vcsNeighborsInputSchema,
  vcsReadFilesInputSchema,
  vcsResolveRepositoryInputSchema,
  vcsSemanticNodeRefSchema,
  vcsStateNodeRefSchema,
  type VcsCompareInput,
  type VcsBlameInput,
  type VcsCommitInput,
  type VcsCopyInput,
  type VcsDiscardInput,
  type VcsEditInput,
  type VcsHistoryInput,
  type VcsInspectInput,
  type VcsListDirectoryInput,
  type VcsListFilesInput,
  type VcsMergeInput,
  type VcsMoveInput,
  type VcsNeighborsInput,
  type VcsReadFilesInput,
  type VcsResolveRepositoryInput,
  type VcsSemanticNodeRef,
} from "@vibestudio/service-schemas/vcs";
import { serializeByKey } from "@vibestudio/shared/keyedSerializer";
import { createReceiverRpcMethods } from "@vibestudio/shared/rpcMethods";
import { compactId, type StateNodeRef } from "@workspace/vcs-engine";
import {
  committedWorkspaceEvent,
  createDoltWorkspaceState,
  workspaceCommitForRef,
  workspacePlacementRoots,
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

const source = "workers/workspace-source";
const className = "GadHistoryDO";
const canonicalKey = "canonical";
const canonicalId = `do:${source}:${className}:${canonicalKey}`;
type StoredHistoryApproval = { approval: HistoryPublicationApproval; expiresAt: number };
type ReplayContextTip = { id: string; committed: string; working: string };
type ReplayReceipt = { head: string; eventId: string; contexts: ReplayContextTip[] };
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
  Pick<GadHistoryDO, "serveHistoryRemote" | "archiveHistoryParticipant">
>(["serveHistoryRemote", "archiveHistoryParticipant"]);

function workKey(participantId: string): string {
  if (!participantId) throw new Error("Missing workspace participant identity");
  return `work-${sha256HexSyncText(participantId)}`;
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
  finishHistoryReplay(input: { eventId: string; head: string; contexts?: ReplayContextTip[] }): { head: string } {
    this.#assertCanonical();
    const contexts = [...(input.contexts ?? [])].sort((left, right) => compareUtf16CodeUnits(left.id, right.id));
    const receipt = { head: input.head, eventId: input.eventId, contexts };
    const recorded = this.readHistoryReplayReceipt();
    if (recorded) {
      if (canonicalJson(recorded) !== canonicalJson(receipt))
        throw new Error("Workspace replay receipt names different revisions");
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

  @rpc(hostWrite)
  reserveHistoryParticipant(input: { participantId: string; contextId: string }): Promise<{
    targetId: string;
    head: string;
    origin: DoltRemoteTarget;
  }> {
    this.#assertCanonical();
    const target = workKey(input.participantId);
    return serializeByKey(this.#allocations, target, async () => {
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
  readHistoryBlame(input: { contextId: string; blame: VcsBlameInput }) {
    return this.#history().blame(input.contextId, vcsBlameInputSchema.parse(input.blame));
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
  readHistoryContentRoots(): string[] {
    this.ensureReady();
    return workspacePlacementRoots(this.sql, this.#remotes().branch.list().map(({ hash }) => hash));
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
  readHistoryMainStateVisibility(input: { state: StateNodeRef }): boolean {
    this.#assertCanonical();
    return workspaceCommitForRef(
      this.sql, this.#remotes().hashOf("main"), vcsStateNodeRefSchema.parse(input.state),
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
    triggerEvidence?: WorkUnitRecord["triggerEvidence"];
  }): Promise<HistoryMutationPlan> {
    this.#assertWritable();
    if (input.transfer.method !== "move" && input.transfer.method !== "copy") {
      throw new Error("Workspace transfer method is invalid");
    }
    const transfer = input.transfer.method === "move"
      ? { method: "move" as const, value: vcsMoveInputSchema.parse(input.transfer.value) }
      : { method: "copy" as const, value: vcsCopyInputSchema.parse(input.transfer.value) };
    return this.#history().planTransfer(input.head, transfer, input.cause, input.triggerEvidence);
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
  resolveHistoryMainMerge(input: { contextId: string; target: StateNodeRef; sourceEventId: string }) {
    const source = vcsSemanticNodeRefSchema.parse({ kind: "event", eventId: input.sourceEventId });
    if (source.kind !== "event") throw new Error("Workspace main integration requires an event");
    return this.#history().resolveMainMerge(
      input.contextId, vcsStateNodeRefSchema.parse(input.target), source.eventId,
    );
  }

  @rpc(hostRead)
  reviewHistoryMainMerge(input: {
    contextId: string;
    compare: VcsCompareInput;
    observation?: Parameters<ParticipantHistory["reviewMainMerge"]>[2];
  }) {
    return this.#history().reviewMainMerge(
      input.contextId, vcsCompareInputSchema.parse(input.compare), input.observation ?? null,
    );
  }

  @rpc(hostRead)
  readHistoryMergeLocations(input: { contextId: string; target: StateNodeRef; source: StateNodeRef }) {
    return this.#history().mainMergeLocations(
      input.contextId, vcsStateNodeRefSchema.parse(input.target), vcsStateNodeRefSchema.parse(input.source),
    );
  }

  @rpc(hostRead)
  previewHistoryContextMerge(input: { contextId: string; head: string; source: MergeSource }) {
    return this.#history().previewContextMerge(input.contextId, input.head, input.source);
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
    return { contextId: input.contextId, targets: members.map(({ target }) => target) };
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
