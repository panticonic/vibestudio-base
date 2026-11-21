import { canonicalJson, compareUtf16CodeUnits, sha256HexSyncText } from "@vibestudio/content-addressing";
import { readPublishedCommitMemory, readPublishedCommitMemoryPage } from "./doltWorkspaceProvenance.js";
import { DurableObjectBase, rpc, type DurableObjectContext } from "@vibestudio/durable";
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
  type VcsPushInput,
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
  recordDoltWorkspaceEvent,
  workspaceCommitForRef,
  workspaceEditBasisAt,
  workspaceExternalDeltaRoots,
  workspaceFileReadsAt,
  workspaceHasFileContent,
  workspacePlacementRoots,
  workspaceRepositoriesAt,
  workspaceTemplateInstallationAt,
  verifyWorkspaceTemplatePublication,
} from "./doltWorkspaceState.js";
import { workspaceListDirectoryAt, workspaceListFilesAt } from "./doltWorkspaceListings.js";
import { execBatchedInsert } from "./sqlBatch.js";
import {
  APPROVED_MAIN_GRANT_LIFETIME_MS,
  grantApprovedMain,
  grantExactHistoryTransition,
  grantParticipantHistory,
  historyRetirementBranch,
  type HistoryForkRequest,
  isWorkspaceRuntimeParticipant,
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
import type { WorkUnitRecord } from "./semanticHistoryRecords.js";
import { createWorkspaceCommitIndex, enableWorkspaceCommitIndex } from "./workspaceCommitIndex.js";
import { createWorkspaceContentRootIndex, indexedWorkspacePlacementRoots } from "./workspaceContentRoots.js";
import { workspaceHistoryInitializationInputSchema, HistoryQueryRequestSchema, HistoryRecallBasisRequestSchema, HistorySearchCauseRequestSchema, HistoryWalkCohortRequestSchema, type HistorySearchCause } from "@vibestudio/service-schemas/workspaceSource";

const source = "workers/workspace-source";
const className = "GadHistoryDO";
const canonicalKey = "canonical";
const canonicalId = `do:${source}:${className}:${canonicalKey}`;
type StoredHistoryApproval = { approval: HistoryPublicationApproval; expiresAt: number };
type IncomingHistoryPublication = MainPublication & { publicationId: string; sourceNodeId: string };
const incomingPublicationPrefix = "incoming/";
const incomingApprovalPrefix = "chronolog-publication:";
const digest = /^[0-9a-f]{64}$/u;
const commitHash = /^[0-9a-f]{40}$/u;

function incomingBranch(input: IncomingHistoryPublication): string {
  if (
    !digest.test(input.publicationId) ||
    !digest.test(input.sourceNodeId) ||
    !commitHash.test(input.previousHead) ||
    !commitHash.test(input.proposedHead) ||
    input.previousHead === input.proposedHead
  ) {
    throw new Error("Invalid incoming workspace history transition");
  }
  return incomingPublicationPrefix + input.publicationId;
}
type SharedHistorySeed = { sourceNodeId: string; head: string; eventId: string };
type SharedHistorySeedReceipt = { seed: SharedHistorySeed; originalHead: string; installed: boolean };
const seedRemote = "workspace-seed";
const seedReceiptKey = "history-seed-receipt";
const localSeedBranch = "seed/initial";
const freshRootBranch = "root/initial";
const freshRootKey = "history-fresh-root";
type FreshRootInput = ReturnType<typeof workspaceHistoryInitializationInputSchema.parse>;
type FreshRootRecord = {
  requestDigest: string;
  eventId: string;
  originalHead: string;
  pin: FreshRootInput["pin"];
};

function sharedSeedBranch(peer: string, head: string): string {
  if (!digest.test(peer) || !commitHash.test(head)) throw new Error("Invalid workspace history seed");
  return `seed/${sha256HexSyncText(canonicalJson([peer, head]))}`;
}

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
  runtimeFork?: { sourceContextId: string; author: string; head: string; state: StateNodeRef };
}

function historyContextKey(contextId: string): string {
  if (!contextId) throw new Error("Missing workspace context identity");
  return `history-context-binding:${sha256HexSyncText(contextId)}`;
}

/** The hosted, versioned history owner. The workspace's trajectory mirror lives separately. */
export class GadHistoryDO extends DurableObjectBase {
  static override schemaVersion = 3;

  readonly #allocations = new Map<string, Promise<unknown>>();
  readonly #outgoing = new Set<string>();
  #participant: ParticipantHistory | undefined;

  constructor(ctx: DurableObjectContext, env: unknown) {
    super(ctx, env);
    enableWorkspaceCommitIndex(this.sql);
  }

  protected createTables(): void {
    createDoltWorkspaceState(this.sql);
    createWorkspaceContentRootIndex(this.sql);
    createWorkspaceCommitIndex(this.sql);
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
      "content_roots",
      "content_root_basis",
      "commit_index",
    ];
  }

  @rpc(hostRead)
  readFreshHistoryRoot() {
    this.#assertCanonical();
    const raw = this.getStateValue(freshRootKey);
    if (raw === null) return null;
    const recorded = JSON.parse(raw) as FreshRootRecord;
    const installedHead = this.getStateValue("history-installed");
    const head = installedHead ?? this.#remotes().hashOf(freshRootBranch);
    this.#assertSeedEvent({ head, eventId: recorded.eventId });
    return { ...recorded, head, installed: installedHead !== null };
  }

  /** Stage the first workspace revision directly from the exact prepared template. */
  @rpc(hostWrite)
  stageFreshHistoryRoot(input: FreshRootInput) {
    this.#assertCanonical();
    const snapshot = workspaceHistoryInitializationInputSchema.parse(input);
    const requestDigest = sha256HexSyncText(canonicalJson(snapshot));
    const staged = this.readFreshHistoryRoot();
    if (staged) {
      if (staged.requestDigest !== requestDigest)
        throw new Error("Workspace history already has a different root snapshot");
      return { ...staged, repositories: workspaceRepositoriesAt(this.sql, staged.head) };
    }
    const paths = new Set(snapshot.repositories.map(({ repoPath }) => repoPath));
    if (!paths.has("meta") || paths.size !== snapshot.repositories.length)
      throw new Error("Fresh workspace root requires distinct repositories and a meta repository");
    const dolt = this.#remotes();
    const originalHead = this.#schemaHead();
    if (this.getStateValue("history-installed") !== null ||
        this.getStateValue(seedReceiptKey) !== null ||
        dolt.hashOf("main") !== originalHead || committedWorkspaceEvent(this.sql, originalHead) ||
        dolt.branch.current() !== "main" || dolt.status().length !== 0)
      throw new Error("Fresh workspace root requires an empty canonical history");
    const branch = dolt.branch.list().find(({ name }) => name === freshRootBranch);
    if (branch && branch.hash !== originalHead)
      throw new Error("Workspace root staging does not match canonical history");
    if (!branch) dolt.branch.create(freshRootBranch, { from: originalHead });
    const eventId = compactId("workspace-event", { kind: "genesis", requestDigest });
    const repositoryRows: string[][] = [];
    const fileRows: Array<Array<string | number>> = [];
    for (const { repoPath, files } of snapshot.repositories) {
      const repositoryId = compactId("repository", { commandId: snapshot.commandId, repoPath });
      repositoryRows.push([repositoryId, repoPath, "present"]);
      for (const file of files) {
        const fileId = compactId("file", { commandId: snapshot.commandId, repositoryId, path: file.path });
        fileRows.push([fileId, repositoryId, file.path, file.contentHash, file.mode,
          file.contentKind, file.byteLength, file.coordinateExtent, "placed"]);
      }
    }
    dolt.checkout(freshRootBranch);
    try {
      this.committedTransaction(() => "Initialize workspace from the root template", () => {
        execBatchedInsert(this.sql, "INSERT INTO repositories (repository_id, repo_path, presence)", 3, repositoryRows);
        execBatchedInsert(this.sql, `INSERT INTO files (file_id, repository_id, path, content_hash,
          mode, content_kind, byte_length, coordinate_extent, presence)`, 9, fileRows);
        recordDoltWorkspaceEvent(this.sql, {
          eventId, commandId: snapshot.commandId, kind: "genesis", message: null,
          createdAt: new Date().toISOString(),
          snapshotSource: { sourceUri: "vibestudio://workspace/root-template", snapshotRevision: snapshot.pin.commit },
        });
        this.sql.exec("INSERT INTO workspace_template_installations (event_id, installation_json) VALUES (?, ?)",
          eventId, canonicalJson(snapshot.installation));
        this.setStateValue(freshRootKey, canonicalJson({
          requestDigest, eventId, originalHead, pin: snapshot.pin,
        } satisfies FreshRootRecord));
      });
    } finally {
      dolt.checkout("main");
    }
    const head = dolt.hashOf(freshRootBranch);
    return {
      requestDigest, eventId, originalHead, pin: snapshot.pin, head, installed: false,
      repositories: workspaceRepositoriesAt(this.sql, head),
    };
  }

  @rpc(hostWrite)
  installFreshHistoryRoot(input: { head: string; eventId: string; requestDigest: string }) {
    const staged = this.readFreshHistoryRoot();
    if (!staged || staged.head !== input.head || staged.eventId !== input.eventId ||
        staged.requestDigest !== input.requestDigest)
      throw new Error("Workspace root installation requires its exact staged revision");
    const dolt = this.#remotes();
    if (!staged.installed) {
      const current = dolt.hashOf("main");
      if ((current !== staged.originalHead && current !== staged.head) ||
          dolt.branch.current() !== "main" || dolt.status().length !== 0)
        throw new Error("Canonical workspace history changed before root installation");
      if (current !== staged.head) dolt.reset({ hard: true, to: staged.head });
      this.setStateValue("history-installed", staged.head);
    }
    if (dolt.branch.list().some(({ name }) => name === freshRootBranch))
      dolt.branch.delete(freshRootBranch, { force: true });
    return { head: staged.head, eventId: staged.eventId };
  }

  /** The host has approved a destination to fetch this exact published revision. */
  @rpc(hostWrite)
  offerSharedHistorySeed(input: { destinationNodeId: string; head: string; eventId: string }) {
    this.#assertPublishedHistory(input);
    const branch = sharedSeedBranch(input.destinationNodeId, input.head);
    const contentHashes = this.#sharedSeedContents(input.head);
    const dolt = this.#remotes();
    const now = Date.now();
    for (const grant of dolt.remote.grants()) {
      const label = grant.label;
      if (!label?.startsWith("seed/")) continue;
      if (label === branch || (
        grant.expiresAt !== null && grant.expiresAt <= now)) {
        dolt.remote.revoke(grant.id);
        if (label !== branch && dolt.branch.list().some(({ name }) => name === label))
          dolt.branch.delete(label, { force: true });
      }
    }
    if (!dolt.branch.list().some(({ name }) => name === branch)) {
      dolt.branch.create(branch, { from: input.head });
    }
    if (dolt.hashOf(branch) !== input.head) throw new Error("Workspace history seed branch changed");
    const grant = dolt.remote.grant({
      fetch: true, label: branch, branches: [branch], peer: input.destinationNodeId,
      expiresAt: now + APPROVED_MAIN_GRANT_LIFETIME_MS,
    });
    return { branch, id: grant.id, token: grant.token, contentHashes };
  }

  /** Serve fetch/ref requests only on the application-authenticated destination's grant. */
  @rpc(hostRead)
  serveSharedHistorySeed(input: { destinationNodeId: string; bytes: Uint8Array }): Uint8Array {
    this.#assertCanonical();
    const bytes = rpcBytesOf(input.bytes);
    if (!digest.test(input.destinationNodeId) || !bytes) {
      throw new Error("Invalid workspace history seed request");
    }
    return this.#remotes().remote.serve(bytes, { peer: input.destinationNodeId });
  }

  @rpc(hostWrite)
  releaseSharedHistorySeed(input: { id: string; destinationNodeId: string; head: string }): void {
    this.#assertCanonical();
    const branch = sharedSeedBranch(input.destinationNodeId, input.head);
    const dolt = this.#remotes();
    const grant = dolt.remote.grants().find(({ id, label }) => id === input.id && label === branch);
    if (!grant) return;
    dolt.remote.revoke(grant.id);
    if (dolt.branch.list().some(({ name }) => name === branch)) dolt.branch.delete(branch, { force: true });
  }

  @rpc(hostRead)
  readSharedHistorySeedReceipt(): SharedHistorySeedReceipt | null {
    this.#assertCanonical();
    const value = this.getStateValue(seedReceiptKey);
    return value === null ? null : JSON.parse(value) as SharedHistorySeedReceipt;
  }

  /** Stage the exact published ancestry before validating files and preparing the host ref update. */
  @rpc(hostWrite)
  stageSharedHistorySeed(input: SharedHistorySeed & {
    destinationNodeId: string; branch: string; token: string; transferId: string;
  }) {
    this.#assertCanonical();
    if (!digest.test(input.sourceNodeId) || input.sourceNodeId === input.destinationNodeId || !input.eventId ||
      !/^[a-f0-9-]{36}$/u.test(input.transferId) ||
      input.branch !== sharedSeedBranch(input.destinationNodeId, input.head) || !input.token) {
      throw new Error("Invalid workspace history seed");
    }
    const seed = { head: input.head, eventId: input.eventId, sourceNodeId: input.sourceNodeId };
    return serializeByKey(this.#allocations, seedRemote, async () => {
      const prior = this.readSharedHistorySeedReceipt();
      if (prior && canonicalJson(prior.seed) !== canonicalJson(seed))
        throw new Error("Workspace history already has a different seed");
      const dolt = this.#remotes();
      const originalHead = prior?.originalHead ?? this.#schemaHead();
      if (!prior?.installed && (this.getStateValue("history-installed") !== null ||
        dolt.hashOf("main") !== originalHead || dolt.branch.current() !== "main" || dolt.status().length !== 0)) {
        throw new Error("Only a fresh workspace can adopt a shared history seed");
      }
      if (!prior?.installed && !dolt.branch.list().some(({ name }) => name === localSeedBranch)) {
        if (dolt.remote.list().some(({ name }) => name === seedRemote)) dolt.remote.remove(seedRemote);
        dolt.remote.add(seedRemote, { ref: `${className}:${canonicalKey}`, token: input.token });
        try {
          const { branches } = await dolt.fetch(seedRemote, {
            branches: [input.branch],
            transport: (bytes) => this.rpc.call("main", mainRpcMethods["runtime.forwardHistoryPacket"], [
              { transferId: input.transferId, bytes },
            ]),
          });
          if (Object.keys(branches).length !== 1 || branches[input.branch] !== seed.head)
            throw new Error("Workspace history fetch returned a different seed");
          this.#assertSeedEvent(seed);
          if (this.getStateValue("history-installed") !== null || dolt.hashOf("main") !== originalHead)
            throw new Error("Workspace history initialized during the seed transfer");
          this.setStateValue(seedReceiptKey, canonicalJson({ seed, originalHead, installed: false }));
          dolt.branch.create(localSeedBranch, { from: seed.head });
        } finally {
          dolt.remote.remove(seedRemote);
        }
      }
      if (!prior?.installed && dolt.hashOf(localSeedBranch) !== seed.head)
        throw new Error("Workspace history seed branch changed");
      this.#assertSeedEvent(seed);
      return {
        state: { kind: "event" as const, eventId: seed.eventId },
        repositories: workspaceRepositoriesAt(this.sql, seed.head),
        contentHashes: this.#sharedSeedContents(seed.head),
      };
    });
  }

  /** Install a staged seed after the protected host has approved its candidate files. */
  @rpc(hostWrite)
  installSharedHistorySeed(seed: SharedHistorySeed) {
    const receipt = this.readSharedHistorySeedReceipt();
    if (!receipt || canonicalJson(receipt.seed) !== canonicalJson(seed))
      throw new Error("Workspace history seed has no exact staged receipt");
    const dolt = this.#remotes();
    if (!receipt.installed) {
      this.#assertSeedEvent(seed);
      const current = dolt.hashOf("main");
      if (this.getStateValue("history-installed") !== null ||
        (current !== receipt.originalHead && current !== seed.head) ||
        dolt.hashOf(localSeedBranch) !== seed.head || dolt.branch.current() !== "main" || dolt.status().length !== 0) {
        throw new Error("Workspace history changed before its seed was installed");
      }
      if (current !== seed.head) dolt.reset({ hard: true, to: seed.head });
      this.ctx.storage.transactionSync(() => {
        this.setStateValue("history-installed", seed.head);
        this.setStateValue(seedReceiptKey, canonicalJson({ ...receipt, installed: true }));
      });
    }
    if (dolt.branch.list().some(({ name }) => name === localSeedBranch)) {
      dolt.branch.delete(localSeedBranch, { force: true });
    }
    return seed;
  }

  #assertSeedEvent(seed: Pick<SharedHistorySeed, "head" | "eventId">): void {
    const event = committedWorkspaceEvent(this.sql, seed.head);
    if (event?.head !== seed.head || event.eventId !== seed.eventId)
      throw new Error("Workspace history seed has a different committed event");
  }

  #sharedSeedContents(head: string): string[] {
    return [...new Set([
      ...workspacePlacementRoots(this.sql, [head]),
      ...workspaceExternalDeltaRoots(this.sql, [head]),
    ])].sort(compareUtf16CodeUnits);
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
    const contexts: string[] = [];
    for (const { key, value } of recorded) {
      if (typeof value !== "string") throw new Error("Invalid workspace context registration");
      const binding = JSON.parse(value) as HistoryContextBinding;
      if (binding.contextId === undefined) continue;
      if (historyContextKey(binding.contextId) !== key)
        throw new Error("Workspace registration names a different context");
      if (!binding.closed && !binding.contextId.startsWith("review:") &&
          binding.contextId.startsWith(prefix)) contexts.push(binding.contextId);
    }
    return contexts.sort(compareUtf16CodeUnits);
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
      // Retirement must be able to identify a reserved owner even if the
      // runtime has yet to create its storage copy.
      const { forkHead, status } = this.ctx.storage.transactionSync(() => {
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
        const forkHead = stored["fork_head"];
        const status = stored["status"];
        if (stored["context_id"] !== input.contextId || typeof forkHead !== "string") {
          throw new Error("Workspace participant allocation changed its owner context");
        }
        if (status !== "reserved" && status !== "active") {
          throw new Error("Workspace participant is retiring");
        }
        const identityKey = `history-allocation-identity:${target}`;
        const previousIdentity = this.getStateValue(identityKey);
        if (previousIdentity !== null && previousIdentity !== input.participantId) {
          throw new Error("Workspace participant allocation changed its identity");
        }
        if (previousIdentity === null) this.setStateValue(identityKey, input.participantId);
        return { forkHead, status };
      });
      const targetId = `do:${source}:${className}:${target}`;
      if (status === "reserved") {
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
  recordHistoryRuntimeFork(input: { contextId: string; sourceContextId: string; author: string; head: string; state: StateNodeRef }) {
    this.#assertCanonical();
    const { contextId, sourceContextId, author, head } = input;
    const retainedOwner = workKey(canonicalJson(["runtime-context-fork-seed", contextId]));
    const binding = this.#assertHistoryContextOpen(contextId);
    if (!sourceContextId || sourceContextId === contextId || !/^[a-f0-9]{40}$/u.test(head) ||
        !this.#assertHistoryContextOpen(sourceContextId).targets.includes(author) ||
        this.#allocationStatus(author) !== "active" ||
        !binding.targets.includes(retainedOwner) || this.#allocationStatus(retainedOwner) !== "active") {
      throw new Error("Runtime workspace fork has no exact retained participant");
    }
    const runtimeFork = { sourceContextId, author, head, state: vcsStateNodeRefSchema.parse(input.state) };
    if (binding.runtimeFork && canonicalJson(binding.runtimeFork) !== canonicalJson(runtimeFork)) {
      throw new Error("Runtime workspace fork changed its captured revision");
    }
    if (!binding.runtimeFork) {
      this.setStateValue(historyContextKey(contextId), canonicalJson({ ...binding, contextId, runtimeFork }));
    }
  }

  @rpc(hostRead)
  readHistoryRuntimeFork(input: { contextId: string }) {
    this.#assertCanonical();
    return this.#assertHistoryContextOpen(input.contextId).runtimeFork ?? null;
  }

  @rpc(hostRead)
  readHistoryRuntimeAuthor(input: { contextId: string; runtimeId?: string }) {
    this.#assertCanonical();
    const binding = this.#historyContextBinding(input.contextId);
    if (binding.closed || !binding.runtimeFork) return null;
    const authors = binding.targets.flatMap((target) => {
      if (this.#allocationStatus(target) !== "active") return [];
      const participant = this.getStateValue(`history-allocation-identity:${target}`);
      if (!participant || workKey(participant) !== target) return [];
      return isWorkspaceRuntimeParticipant(participant, input.contextId, input.runtimeId)
        ? [participant] : [];
    });
    if (authors.length > 1) {
      throw new Error("Runtime workspace context has several active authors");
    }
    return authors[0] ?? null;
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
  }): Promise<string> {
    this.#recordHistoryOrigin(input);
    return this.#history().bindContext(input.contextId, input.origin);
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
  readHistoryFiles(input: { contextId: string | null; read: VcsReadFilesInput }) {
    const read = vcsReadFilesInputSchema.parse(input.read);
    return input.contextId === null
      ? workspaceFileReadsAt(this.sql, this.#publishedRevision(read.state), read)
      : this.#history().readFiles(input.contextId, read);
  }

  @rpc(hostRead)
  listHistoryFiles(input: { contextId: string | null; list: VcsListFilesInput }) {
    const list = vcsListFilesInputSchema.parse(input.list);
    return input.contextId === null
      ? workspaceListFilesAt(this.sql, this.#publishedRevision(list.state), list)
      : this.#history().listFiles(input.contextId, list);
  }

  @rpc(hostRead)
  listHistoryDirectory(input: { contextId: string | null; list: VcsListDirectoryInput }) {
    const list = vcsListDirectoryInputSchema.parse(input.list);
    return input.contextId === null
      ? workspaceListDirectoryAt(this.sql, this.#publishedRevision(list.state), list)
      : this.#history().listDirectory(input.contextId, list);
  }

  @rpc(hostRead)
  resolveHistoryRepository(input: { contextId: string | null; repository: VcsResolveRepositoryInput }) {
    const repository = vcsResolveRepositoryInputSchema.parse(input.repository);
    if (input.contextId !== null) return this.#history().resolveRepository(input.contextId, repository);
    const { state, repoPath } = repository;
    const basis = workspaceEditBasisAt(this.sql, this.#publishedRevision(state));
    const resolved = basis.repositoryAtPath(repoPath);
    return resolved ? { state, repoPath, repositoryId: resolved.repositoryId } : null;
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
  readHistoryRecallBasis(input: ReturnType<typeof HistoryRecallBasisRequestSchema.parse>) {
    const { contextId, protectedEventId } = HistoryRecallBasisRequestSchema.parse(input);
    return this.#history().recallBasis(contextId, protectedEventId);
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
      ...indexedWorkspacePlacementRoots(this.sql, heads, (write) => this.transactionSync(write)),
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
  readHistoryWorkingState(input: { contextId: string }) {
    return this.#history().workingState(input.contextId);
  }

  @rpc(hostRead)
  readHistoryMain(input?: {
    commitMemoryEventId: string;
    commitMemoryPage?: { previousEventId: string | null; after: string | null } | null;
  }) {
    this.#assertCanonical();
    const head = this.#remotes().hashOf("main");
    const main = committedWorkspaceEvent(this.sql, head);
    if (main?.head !== head) throw new Error("Workspace main is missing its committed event");
    if (!input) return main;
    if (input.commitMemoryPage === null) return { ...main, commitMemoryPage: null };
    const event = vcsStateNodeRefSchema.parse({ kind: "event", eventId: input.commitMemoryEventId });
    const revision = workspaceCommitForRef(this.sql, head, event);
    if (!revision) throw new Error("Commit memory event is outside canonical history");
    if (input.commitMemoryPage) {
      const { previousEventId, after } = input.commitMemoryPage;
      if (after !== null && (typeof after !== "string" || !after))
        throw new Error("Invalid commit memory cursor");
      const previous = previousEventId === null ? null : workspaceCommitForRef(
        this.sql, revision, vcsStateNodeRefSchema.parse({ kind: "event", eventId: previousEventId }),
      );
      if (previousEventId !== null && !previous)
        throw new Error("Prior commit memory event is outside the protected snapshot");
      return { ...main, commitMemoryPage: {
        eventId: input.commitMemoryEventId,
        ...readPublishedCommitMemoryPage(this.sql, revision, previous, after),
      } };
    }
    return { ...main, commitMemory: readPublishedCommitMemory(this.sql, revision, input.commitMemoryEventId) };
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
    const state = vcsStateNodeRefSchema.parse({ kind: "event", eventId: input.eventId });
    return workspaceTemplateInstallationAt(this.sql, this.#publishedRevision(state));
  }

  #publishedRevision(state: StateNodeRef): string {
    this.#assertCanonical();
    if (state.kind !== "event") throw new Error("Published workspace reads require a saved event");
    const revision = workspaceCommitForRef(this.sql, this.#remotes().hashOf("main"), state);
    if (!revision) throw new Error("Workspace event is outside canonical history");
    return revision;
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

  #assertPublishedHistory(input: { eventId: string; head: string }): void {
    this.#assertCanonical();
    const current = this.#remotes().hashOf("main");
    if (workspaceCommitForRef(this.sql, current, { kind: "event", eventId: input.eventId }) !== input.head)
      throw new Error("The selected history revision has no published event");
  }

  @rpc(hostRead)
  hasOutgoingHistoryContent(input: { eventId: string; head: string; digest: string }): boolean {
    this.#assertPublishedHistory(input);
    if (!digest.test(input.digest)) throw new Error("Invalid outgoing workspace content digest");
    return workspaceHasFileContent(this.sql, input.head, input.digest) ||
      workspaceExternalDeltaRoots(this.sql, [input.head]).includes(input.digest);
  }

  @rpc(hostWrite)
  async pushOutgoingHistory(input: {
    transferId: string;
    eventId: string;
    head: string;
    origin: DoltRemoteTarget;
    branch: string;
  }) {
    this.#assertPublishedHistory(input);
    if (!/^[a-f0-9-]{36}$/u.test(input.transferId) || !/^incoming\/[a-f0-9]{64}$/u.test(input.branch) ||
        this.#outgoing.has(input.transferId)) {
      throw new Error("Invalid outgoing workspace history transfer");
    }
    const dolt = this.#remotes();
    for (const { name } of dolt.remote.list()) {
      if (name.startsWith("chronolog-") && !this.#outgoing.has(name.slice("chronolog-".length)))
        dolt.remote.remove(name);
    }
    for (const { name } of dolt.branch.list()) {
      if (name.startsWith("outgoing/") && !this.#outgoing.has(name.slice("outgoing/".length)))
        dolt.branch.delete(name, { force: true });
    }
    const remoteName = `chronolog-${input.transferId}`;
    const branch = `outgoing/${input.transferId}`;
    dolt.branch.create(branch, { from: input.head });
    this.#outgoing.add(input.transferId);
    try {
      dolt.remote.add(remoteName, input.origin);
      return await dolt.push(remoteName, branch, {
        to: input.branch,
        transport: (bytes) => this.rpc.call("main", mainRpcMethods["runtime.forwardHistoryPacket"], [
          { transferId: input.transferId, bytes },
        ]),
      });
    } finally {
      this.#outgoing.delete(input.transferId);
      if (dolt.remote.list().some(({ name }) => name === remoteName)) dolt.remote.remove(remoteName);
      dolt.branch.delete(branch, { force: true });
    }
  }

  /** The host has verified the signed Chronolog transition and the connected peer. */
  @rpc(hostWrite)
  stageIncomingHistory(input: IncomingHistoryPublication) {
    this.#assertCanonical();
    const branch = incomingBranch(input);
    const completed = this.getStateValue(`history-completed:${input.publicationId}`);
    if (completed !== null) {
      const transition = JSON.parse(completed) as MainPublication;
      if (transition.previousHead !== input.previousHead || transition.proposedHead !== input.proposedHead)
        throw new Error("Incoming workspace publication names a different completed transition");
      return { kind: "applied" as const, head: transition.proposedHead };
    }
    const dolt = this.#remotes();
    const main = this.readHistoryMain();
    if (main.head === input.proposedHead) return { kind: "applied" as const, head: main.head };
    if (main.head !== input.previousHead) throw new HistoryHeadChanged(input.previousHead, main.head);
    const now = Date.now();
    const peer = `${input.sourceNodeId}:${input.publicationId}`;
    const grants = dolt.remote.grants();
    for (const grant of grants) {
      if (grant.label?.startsWith(incomingPublicationPrefix) &&
          (grant.label === branch || (grant.expiresAt !== null && grant.expiresAt <= now))) {
        dolt.remote.revoke(grant.id);
      }
    }
    const staged = dolt.branch.list().find(({ name }) => name === branch);
    if (staged?.hash === input.proposedHead) return { kind: "staged" as const, head: staged.hash };
    if (staged === undefined) dolt.branch.create(branch, { from: input.previousHead });
    const grant = grantExactHistoryTransition(
      dolt, branch, input, now + APPROVED_MAIN_GRANT_LIFETIME_MS, peer, branch,
    );
    return {
      kind: "grant" as const,
      id: grant.id,
      ref: `${className}:${canonicalKey}`,
      branch,
      token: grant.token,
    };
  }

  @rpc(hostRead)
  checkIncomingHistory(input: IncomingHistoryPublication): void {
    this.#assertCanonical();
    const branch = incomingBranch(input);
    const main = this.readHistoryMain();
    if (main.head !== input.previousHead) throw new HistoryHeadChanged(input.previousHead, main.head);
    const peer = `${input.sourceNodeId}:${input.publicationId}`;
    const allowed = this.#remotes().remote.grants().some((grant) =>
      grant.label === branch && grant.peer === peer &&
      grant.pushTransition?.previous === input.previousHead &&
      grant.pushTransition.next === input.proposedHead &&
      grant.expiresAt !== null && grant.expiresAt > Date.now(),
    );
    if (!allowed) throw new Error("Incoming workspace history has no live grant");
  }

  @rpc(hostWrite)
  serveIncomingHistory(input: IncomingHistoryPublication & { bytes: Uint8Array }): Uint8Array {
    this.checkIncomingHistory(input);
    const bytes = rpcBytesOf(input.bytes);
    if (!bytes) throw new Error("Invalid incoming workspace history bytes");
    const peer = `${input.sourceNodeId}:${input.publicationId}`;
    return this.#remotes().remote.serve(bytes, { peer });
  }

  #incomingHistoryHead(input: IncomingHistoryPublication) {
    this.#assertCanonical();
    const branch = incomingBranch(input);
    const main = this.readHistoryMain();
    if (main.head !== input.previousHead) throw new HistoryHeadChanged(input.previousHead, main.head);
    const staged = this.#remotes().branch.list().find(({ name }) => name === branch);
    if (staged?.hash !== input.proposedHead) throw new Error("Incoming workspace history is incomplete");
    const event = committedWorkspaceEvent(this.sql, staged.hash);
    if (event?.head !== staged.hash) throw new Error("Incoming workspace history does not name a committed event");
    return { main, event };
  }

  @rpc(hostRead)
  hasIncomingHistoryContent(input: IncomingHistoryPublication & { digest: string }): boolean {
    if (!digest.test(input.digest)) throw new Error("Invalid incoming workspace content digest");
    const { event } = this.#incomingHistoryHead(input);
    return workspaceHasFileContent(this.sql, event.head, input.digest) ||
      workspaceExternalDeltaRoots(this.sql, [event.head]).includes(input.digest);
  }

  @rpc(hostRead)
  readIncomingHistory(input: IncomingHistoryPublication) {
    const { main, event } = this.#incomingHistoryHead(input);
    return {
      head: event.head,
      state: { kind: "event" as const, eventId: event.eventId },
      repositories: workspaceRepositoriesAt(this.sql, event.head),
      previousEventId: main.eventId,
      contentHashes: [...new Set([
        ...workspacePlacementRoots(this.sql, [event.head]),
        ...workspaceExternalDeltaRoots(this.sql, [event.head]),
      ])].sort(compareUtf16CodeUnits),
    };
  }

  #incomingApproval(input: IncomingHistoryPublication & { group: string; publisher: string }) {
    if (!digest.test(input.group) || !digest.test(input.publisher))
      throw new Error("Incoming workspace history has no verified Chronolog publisher");
    const { main, event } = this.#incomingHistoryHead(input);
    return {
      publicationId: incomingApprovalPrefix + input.publicationId,
      participantId: `chronolog:${input.group}:${input.publisher}`,
      previousEventId: main.eventId,
      proposedEventId: event.eventId,
      publication: { previousHead: main.head, proposedHead: event.head },
    } satisfies HistoryPublicationApproval;
  }

  /** The same protected host gate that publishes local work has accepted this exact revision. */
  @rpc(hostWrite)
  authorizeIncomingHistory(input: IncomingHistoryPublication & { group: string; publisher: string }) {
    const approval = this.#incomingApproval(input);
    const previous = this.#storedApproval(approval.publicationId);
    if (previous && canonicalJson(previous.approval) !== canonicalJson(approval))
      throw new Error("Incoming workspace publication approval changed");
    const expiresAt = Date.now() + APPROVED_MAIN_GRANT_LIFETIME_MS;
    this.setStateValue(this.#approvalKey(approval.publicationId), canonicalJson({
      approval, expiresAt,
    } satisfies StoredHistoryApproval));
  }

  @rpc(hostWrite)
  publishIncomingHistory(input: IncomingHistoryPublication & { group: string; publisher: string }) {
    this.#assertCanonical();
    const branch = incomingBranch(input);
    const id = incomingApprovalPrefix + input.publicationId;
    const recorded = this.#storedApproval(id);
    if (!recorded) throw new Error("Incoming workspace history requires durable approval");
    if (recorded.approval.publication.previousHead !== input.previousHead ||
        recorded.approval.publication.proposedHead !== input.proposedHead ||
        recorded.approval.participantId !== `chronolog:${input.group}:${input.publisher}`) {
      throw new Error("Incoming workspace history approval names a different publication");
    }
    const dolt = this.#remotes();
    if (!this.#publishedApproval(recorded.approval)) {
      const approval = this.#incomingApproval(input);
      if (canonicalJson(approval) !== canonicalJson(recorded.approval) || recorded.expiresAt <= Date.now())
        throw new Error("Incoming workspace history approval is no longer active");
      if (dolt.branch.current() !== "main" || dolt.status().length !== 0)
        throw new Error("Canonical workspace history is not ready for a fast-forward");
      const base = dolt.query("SELECT dolt_merge_base(?1, ?2)", [
        { index: 1, value: input.previousHead },
        { index: 2, value: input.proposedHead },
      ]).rows[0]?.[0];
      if (base !== input.previousHead) throw new Error("Incoming workspace history cannot fast-forward main");
      const result = dolt.merge(branch);
      if (result.hash !== input.proposedHead || result.conflicts.length !== 0)
        throw new Error("Incoming workspace history did not advance to the approved head");
    }
    for (const grant of dolt.remote.grants()) {
      if (grant.label === branch) dolt.remote.revoke(grant.id);
    }
    if (dolt.branch.list().some(({ name }) => name === branch)) dolt.branch.delete(branch, { force: true });
    return { head: input.proposedHead };
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
    const incoming = input.publicationId.startsWith(incomingApprovalPrefix);
    if (!incoming) {
      // A lost grant or push reply can prevent the host from releasing its permit.
      // Keep the receipt until every permit for this applied transition is gone.
      const { participantId, publication } = receipt.approval;
      const peer = participantPeerPrefix + workKey(participantId);
      const remote = this.#remotes().remote;
      for (const grant of remote.grants()) {
        if (grant.peer === peer && grant.push.length === 1 && grant.push[0] === "main" &&
            grant.pushTransition?.previous === publication.previousHead &&
            grant.pushTransition.next === publication.proposedHead) {
          remote.revoke(grant.id);
        }
      }
    }
    this.ctx.storage.transactionSync(() => {
      if (incoming) {
        const received = input.publicationId.slice(incomingApprovalPrefix.length);
        this.setStateValue(`history-completed:${received}`, canonicalJson(receipt.approval.publication));
      }
      this.deleteStateValue(this.#approvalKey(input.publicationId));
    });
  }

  @rpc(hostRead)
  async verifyHistoryTemplatePublication(input: {
    contextId: string;
    previousHead: string;
    proposedHead: string;
    eventId: string;
    installation?: VcsPushInput["templateInstallation"];
  }): Promise<void> {
    const saved = await this.#assertSaved(this.#history(), input.contextId, input.proposedHead);
    if (saved.eventId !== input.eventId) {
      throw new Error("Workspace publication names a different saved event");
    }
    verifyWorkspaceTemplatePublication(this.sql, input);
  }

  @rpc(hostWrite)
  async publishApprovedHistory(input: {
    contextId: string;
    publication: MainPublication;
    proposedEventId: string;
    origin: DoltRemoteTarget;
    installation?: VcsPushInput["templateInstallation"];
  }) {
    const history = this.#history();
    const saved = await this.#assertSaved(history, input.contextId, input.publication.proposedHead);
    if (saved.eventId !== input.proposedEventId) {
      throw new Error("Workspace publication names a different saved event");
    }
    verifyWorkspaceTemplatePublication(this.sql, {
      ...input.publication,
      eventId: saved.eventId,
      ...(input.installation ? { installation: input.installation } : {}),
    });
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
