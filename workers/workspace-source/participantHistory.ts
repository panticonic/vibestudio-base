import { compareUtf16CodeUnits, sha256HexSyncText } from "@vibestudio/content-addressing";
import type { SqlStorage } from "@vibestudio/durable";
import {
  type DoltCapableStorage,
  type DoltCommitMessage,
  type DoltGrant,
  type DoltMergeOptions,
  type DoltRemoteStorage,
  type DoltRemoteTarget,
  type DoltRemoteTransport,
  doltRemotesOf,
} from "@vibestudio/durable/dolt";
import type { VcsEditInput } from "@vibestudio/service-schemas/vcs";
import { serializeByKey } from "@vibestudio/shared/keyedSerializer";
import type { StateNodeRef } from "@workspace/vcs-engine";
import {
  applyDoltWorkspaceState,
  committedWorkspaceEvent,
  prepareDoltEditPlacement,
  recordDoltWorkspaceApplication,
  recordDoltWorkspaceEvent,
  workspaceCommitForRef,
  workspaceContentOriginsAt,
  workspaceEditBasisAt,
  workspacePlacementRoots,
  workspaceRepositoriesAt,
  type WorkspacePlacementChange,
} from "./doltWorkspaceState.js";
import { SemanticProvenanceWriter, stateNodeKey, validateApplicationPlan } from "./semanticProvenanceWriter.js";
import { SemanticVcsError } from "./semanticVcsErrors.js";
import type {
  ApplicationPersistencePlan,
  JournalCommand,
  WorkspaceEventRecord,
  WorkUnitRecord,
} from "./semanticVcsStore.js";
import { SemanticWorkspace, type MutationDraft } from "./semanticWorkspace.js";

type ResolvingMerge = DoltMergeOptions & {
  readonly resolve: NonNullable<DoltMergeOptions["resolve"]>;
};

export interface MainPublication {
  readonly previousHead: string;
  readonly proposedHead: string;
}

export interface CommittedContext {
  readonly contextId: string;
  readonly head: string;
}

export type HistoryEditPlan =
  | { kind: "read-content"; contentHashes: string[] }
  | {
      kind: "planned";
      application: HistoryApplicationPlan;
      blobs: NonNullable<MutationDraft["blobs"]>;
      result: ReturnType<typeof SemanticWorkspace.prepareApplication>["result"];
    };

export type HistoryApplicationPlan = Omit<ApplicationPersistencePlan, "workspaceFacts"> & {
  placement: WorkspacePlacementChange | null;
};

interface MergeSource extends CommittedContext {
  readonly participantId?: string;
}

type WorkspaceStorage = DoltCapableStorage & { readonly sql: SqlStorage };
type HistoryCommand = Pick<JournalCommand, "commandId" | "method" | "requestDigest" | "cause">;
const APPROVED_MAIN_GRANT_LIFETIME_MS = 5 * 60_000;

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
): DoltGrant {
  const actual = canonical.hashOf("main");
  if (actual !== publication.previousHead) {
    throw new HistoryHeadChanged(publication.previousHead, actual);
  }
  const pushTransition = {
    previous: publication.previousHead,
    next: publication.proposedHead,
  };
  const expiresAt = Date.now() + APPROVED_MAIN_GRANT_LIFETIME_MS;
  const grant = canonical.remote.grant({
    push: ["main"],
    pushTransition,
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
  readonly #turns = new Map<string, Promise<unknown>>();

  constructor(participantId: string, storage: WorkspaceStorage, transport: DoltRemoteTransport) {
    this.#participant = branchSegment(participantId);
    this.#storage = storage;
    const dolt = doltRemotesOf(storage);
    if (!dolt) throw new Error("GAD work cells require Dolt remotes");
    this.#dolt = dolt;
    this.#transport = transport;
  }

  connect(origin: DoltRemoteTarget): Promise<string> {
    return this.#run(() => {
      this.#configureRemote("origin", origin);
      return this.#fetchMain();
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

  contentOrigins(contextId: string, ref: StateNodeRef, fileIds: readonly string[]) {
    return this.#run(() => {
      const commit = this.#resolveState(contextId, ref);
      if (!commit) throw new Error(`Workspace state is outside context ${contextId}`);
      return workspaceContentOriginsAt(this.#storage.sql, commit, fileIds);
    });
  }

  planEdit(
    head: string,
    edit: VcsEditInput,
    receipt: Record<string, unknown> | null,
    triggerEvidence: WorkUnitRecord["triggerEvidence"] = null,
  ): Promise<HistoryEditPlan> {
    return this.#run(() => {
      this.#assertHead(this.#contextBranch(edit.contextId), head);
      const { sql } = this.#storage;
      if (workspaceCommitForRef(sql, head, edit.expectedWorkingHead) !== head) {
        throw new SemanticVcsError(
          "RevisionChanged",
          "Workspace edit names a different working revision",
        );
      }
      const basis = workspaceEditBasisAt(sql, head);
      if (receipt === null) {
        const contentHashes = SemanticWorkspace.editContentHashes(edit, basis);
        if (contentHashes.length > 0) return { kind: "read-content", contentHashes };
      }
      const draft = SemanticWorkspace.planEdit(edit, receipt, basis);
      const fileIds = draft.changes.flatMap(({ base }) =>
        base?.["kind"] === "file" && typeof base["fileId"] === "string" ? [base["fileId"]] : [],
      );
      const origins = workspaceContentOriginsAt(sql, head, fileIds);
      for (const fileId of fileIds) {
        if (!origins.has(fileId))
          throw new SemanticVcsError("IntegrityFailure", `File ${fileId} has no content origin`);
      }
      const externalKeys = [...new Set([...origins.values()].flatMap((origin) => origin.externalKeys))]
        .sort(compareUtf16CodeUnits);
      if (externalKeys.length > 256) {
        throw new SemanticVcsError(
          "ScopeTooLarge",
          "A semantic mutation cannot persist more than 256 external lineage keys",
        );
      }
      const prepared = SemanticWorkspace.prepareApplication(edit, draft, edit.commandId, {
        now: () => new Date().toISOString(),
        workUnitEvidence: () => ({ authorContextId: edit.contextId, triggerEvidence }),
        contentIntegrity: () => ({
          class: externalKeys.length ? "external" : "internal",
          externalKeys,
          contentOrigins: new Map(),
        }),
        contentOrigins: (_state, selected) => new Map(selected.flatMap((id) => {
          const origin = origins.get(id);
          return origin ? [[id, origin] as const] : [];
        })),
        invertedCounteractions: () => {
          throw new SemanticVcsError("IntegrityFailure", "An edit cannot counteract a change");
        },
        preparePlacement: (files, repositories) => prepareDoltEditPlacement(head, files, repositories),
      });
      return {
        kind: "planned",
        application: { ...prepared.plan, placement: prepared.placement },
        blobs: draft.blobs ?? [],
        result: prepared.result,
      };
    });
  }

  placementHistoryRoots(): Promise<string[]> {
    return this.#run(() => workspacePlacementRoots(
      this.#storage.sql,
      this.#dolt.branch.list().map(({ hash }) => hash),
    ));
  }

  forkContext(parentId: string, expectedHead: string, childId: string): Promise<string> {
    return this.#run(() => {
      this.#assertHead(this.#contextBranch(parentId), expectedHead);
      return this.#openBranch(childId, expectedHead);
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
      const { sql } = this.#storage;
      if (command.commandId !== workUnit.commandId || workUnit.authorContextId !== contextId) {
        throw new SemanticVcsError(
          "IntegrityFailure",
          "Prepared command ownership differs from the work unit"
        );
      }
      const current = this.#dolt.hashOf(this.#contextBranch(contextId));
      if (this.#hasCommand(current, contextId, command)) {
        const head = workspaceCommitForRef(sql, current, value);
        if (!head)
          throw new SemanticVcsError(
            "CommandIdReuse",
            "Prepared command has a different application"
          );
        const rows = sql
          .exec(
            `SELECT 1 FROM dolt_at_applications(?) app
           JOIN dolt_at_gad_work_units(?) work USING (work_unit_id)
           WHERE app.application_id = ? AND work.command_id = ?`,
            head,
            head,
            value.applicationId,
            command.commandId
          )
          .toArray();
        if (rows.length !== 1)
          throw new SemanticVcsError(
            "CommandIdReuse",
            "Application belongs to a different command"
          );
        return { value, head };
      }
      return this.#commit(contextId, expectedHead, `Workspace ${command.method}`, () => {
        validateApplicationPlan(plan);
        if (
          stateNodeKey(plan.expectedWorkingHead) !== stateNodeKey(application.basis) ||
          workspaceCommitForRef(sql, expectedHead, application.basis) !== expectedHead
        ) {
          throw new SemanticVcsError("RevisionChanged", "Prepared workspace revision has changed");
        }
        this.#recordCommand(contextId, command, workUnit.createdAt);
        if (plan.placement === undefined) {
          throw new SemanticVcsError("IntegrityFailure", "Prepared workspace placement is missing");
        }
        if (plan.placement !== null) applyDoltWorkspaceState(sql, plan.placement);
        const provenance = new SemanticProvenanceWriter(sql);
        provenance.persistWorkUnit(workUnit);
        provenance.persistChanges(plan.changes);
        provenance.persistAppliedChanges(plan.appliedChanges);
        for (const edge of plan.contentEdges) provenance.persistContentEdge(edge);
        for (const decision of plan.decisions) provenance.persistDecision(decision);
        recordDoltWorkspaceApplication(sql, application);
        return value;
      });
    });
  }

  /** Mark a prepared working revision as saved without changing any placements. */
  commitEvent(
    contextId: string,
    expectedHead: string,
    command: HistoryCommand,
    event: WorkspaceEventRecord
  ): Promise<{ readonly value: StateNodeRef; readonly head: string }> {
    const value = { kind: "event" as const, eventId: event.eventId };
    return this.#run(() => {
      const { sql } = this.#storage;
      if (
        event.kind !== "commit" ||
        event.commandId !== command.commandId ||
        event.parentEventIds.length !== 1 ||
        event.externalDeltaIds?.length
      ) {
        throw new SemanticVcsError(
          "IntegrityFailure",
          "Prepared event does not describe a linear workspace commit"
        );
      }
      const current = this.#dolt.hashOf(this.#contextBranch(contextId));
      if (this.#hasCommand(current, contextId, command)) {
        const head = workspaceCommitForRef(sql, current, value);
        if (
          !head ||
          sql
            .exec(
              "SELECT 1 FROM dolt_at_events(?) WHERE event_id = ? AND command_id = ?",
              head,
              event.eventId,
              command.commandId
            )
            .toArray().length !== 1
        ) {
          throw new SemanticVcsError("CommandIdReuse", "Prepared command has a different event");
        }
        return { value, head };
      }
      return this.#commit(
        contextId,
        expectedHead,
        event.message || "Save workspace revision",
        () => {
          const parent = committedWorkspaceEvent(sql, expectedHead);
        if (!parent || parent.eventId !== event.parentEventIds[0]) {
            throw new SemanticVcsError(
              "RevisionChanged",
              "Prepared workspace event has a different parent"
            );
          }
          if (parent.head === expectedHead)
            throw new SemanticVcsError("NoEffect", "Workspace context has no working changes");
          const applicationId = event.applicationIds.at(-1);
          if (
            !applicationId ||
            workspaceCommitForRef(sql, expectedHead, { kind: "application", applicationId }) !==
              expectedHead
          ) {
            throw new SemanticVcsError(
              "RevisionChanged",
              "Prepared workspace event has a different final application"
            );
          }
          this.#recordCommand(contextId, command, event.createdAt);
          recordDoltWorkspaceEvent(sql, event);
          return value;
        }
      );
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
      const context = this.#contextBranch(source.contextId);
      let sourceBranch = context;
      if (source.participantId !== undefined) {
        const participant = branchSegment(source.participantId);
        if (participant !== this.#participant) {
          const published = `pub/${participant}/${context.slice("ctx/".length)}`;
          await this.#dolt.fetch("origin", {
            branches: [published],
            transport: this.#transport,
          });
          sourceBranch = `origin/${published}`;
        }
      }
      if (source.head !== this.#mergeBase(sourceBranch, source.head)) {
        throw new Error("The requested commit is outside the source context");
      }
      this.#checkoutExpected(contextId, expectedHead);
      return this.#dolt.merge(source.head, options);
    });
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
      const archives = this.#dolt.branch.list().filter(({name}) => name.startsWith("ctx/")).map(({name, hash}) => {
        const event = committedWorkspaceEvent(this.#storage.sql, hash);
        if (!event) throw new Error(`Workspace history lacks a committed event for ${name}`);
        return { context: name, committed: event.head };
      });
      return this.#archiveCommittedBranches(archives, main, grantTarget);
    });
  }

  async #archiveCommittedBranches(archives: readonly { context: string; committed: string }[], main: string, grantTarget: DoltRemoteTarget): Promise<void> {
      const remote = "retirement";
      this.#configureRemote(remote, grantTarget);
      try {
        await this.#dolt.fetch(remote, { branches: ["main"], transport: this.#transport });
        for (const { context, committed } of archives) {
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

  #commit<T>(contextId: string, expectedHead: string, message: DoltCommitMessage, write: () => T) {
    const branch = this.#checkoutExpected(contextId, expectedHead);
    const value = this.#storage.transactionSync(write, { commit: message });
    return { value, head: this.#dolt.hashOf(branch) };
  }

  #hasCommand(at: string, contextId: string, command: HistoryCommand): boolean {
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
      prior["request_digest"] !== command.requestDigest ||
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
    return serializeByKey(this.#turns, this.#participant, turn);
  }

  #configureRemote(name: string, target: DoltRemoteTarget): void {
    if (this.#dolt.remote.list().some((remote) => remote.name === name)) {
      this.#dolt.remote.remove(name);
    }
    this.#dolt.remote.add(name, target);
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

  #contextBranch(contextId: string): string {
    return `ctx/${branchSegment(contextId)}`;
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
