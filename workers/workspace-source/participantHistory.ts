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
  VcsCommitInput,
  VcsCommitResult,
  VcsDiscardInput,
  VcsDiscardResult,
  VcsEditInput,
  VcsMergeInput,
  VcsReadFilesInput,
  VcsSemanticNodeRef,
  VcsStatusResult,
} from "@vibestudio/service-schemas/vcs";
import { serializeByKey } from "@vibestudio/shared/keyedSerializer";
import { compactId, type StateNodeRef } from "@workspace/vcs-engine";
import {
  applyDoltWorkspaceState,
  committedWorkspaceEvent,
  prepareDoltEditPlacement,
  recordDoltWorkspaceApplication,
  recordDoltWorkspaceEvent,
  workspaceApplicationsAt,
  workspaceCommitForRef,
  workspaceContentOriginsAt,
  workspaceEditBasisAt,
  workspaceFileReadsAt,
  workspaceMergeScope,
  workspaceMergeSourcesAt,
  workspaceRepositoriesAt,
  type WorkspacePlacementChange,
  type WorkspaceMergeScopeEntry,
} from "./doltWorkspaceState.js";
import { workspaceReferenceAt } from "./doltWorkspaceReferences.js";
import { declineHistoryFileCollisions } from "./doltPlacementConflicts.js";
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
} from "./semanticVcsStore.js";
import { MAX_WORKING_APPLICATIONS, SemanticWorkspace, type MutationDraft } from "./semanticWorkspace.js";

type ResolvingMerge = DoltMergeOptions & {
  readonly resolve: NonNullable<DoltMergeOptions["resolve"]>;
};

export interface MainMergePreview {
  head: string;
  main: string;
  base: string;
  incoming: WorkspaceMergeScopeEntry[];
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

export type HistoryEditPlan =
  | { kind: "read-content"; contentHashes: string[] }
  | { kind: "committed"; head: string; result: HistoryEditResult & { workingHead: StateNodeRef } }
  | {
      kind: "planned";
      command: HistoryCommand;
      application: HistoryApplicationPlan;
      blobs: NonNullable<MutationDraft["blobs"]>;
      result: HistoryEditResult;
    };

export type HistoryMergeResult =
  | { kind: "read-content"; contentHashes: string[] }
  | { kind: "prepare-content"; blobs: NonNullable<MutationDraft["blobs"]> }
  | { kind: "committed"; value: StateNodeRef; head: string };

interface HistoryMergeContent {
  observation: HistoryMergeObservation;
  contentHashes?: readonly string[];
}

type HistoryEditResult = ReturnType<typeof SemanticWorkspace.prepareApplication>["result"];
export type HistoryApplicationPlan = Omit<ApplicationPersistencePlan, "workspaceFacts"> & {
  placement: WorkspacePlacementChange | null;
};

export interface MergeSource extends CommittedContext {
  readonly participantId?: string;
}

interface HistoryDiscardReceipt {
  commandId: string;
  requestDigest: string;
  head: string;
  result: { head: string; discard: VcsDiscardResult };
}

interface HistoryDiscardJournal {
  get(key: string): string | null;
  set(key: string, value: string): void;
  delete(key: string): void;
}

const PENDING_DISCARD_KEY = "history-discard-pending";
const discardReceiptKey = (id: string) => `history-discard:${sha256HexSyncText(id)}`;

type WorkspaceStorage = DoltCapableStorage & { readonly sql: SqlStorage };
export type HistoryCommand = Pick<JournalCommand, "commandId" | "method" | "requestDigest" | "cause">;
export const APPROVED_MAIN_GRANT_LIFETIME_MS = 5 * 60_000;

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
  expiresAt = Date.now() + APPROVED_MAIN_GRANT_LIFETIME_MS,
): DoltGrant {
  const actual = canonical.hashOf("main");
  if (actual !== publication.previousHead) {
    throw new HistoryHeadChanged(publication.previousHead, actual);
  }
  const pushTransition = {
    previous: publication.previousHead,
    next: publication.proposedHead,
  };
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
  readonly #discardJournal: HistoryDiscardJournal | undefined;
  #discardJournalReady = false;
  readonly #turns = new Map<string, Promise<unknown>>();

  constructor(
    participantId: string,
    storage: WorkspaceStorage,
    transport: DoltRemoteTransport,
    discardJournal?: HistoryDiscardJournal,
  ) {
    this.#participant = branchSegment(participantId);
    this.#storage = storage;
    const dolt = doltRemotesOf(storage);
    if (!dolt) throw new Error("GAD work cells require Dolt remotes");
    this.#dolt = dolt;
    this.#transport = transport;
    this.#discardJournal = discardJournal;
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

  readFiles(contextId: string, input: VcsReadFilesInput) {
    return this.#run(async () => {
      const commit = await this.#resolveReadableState(contextId, input.state);
      if (!commit) {
        throw new SemanticVcsError("InvalidReference", "File read names a state outside this workspace context");
      }
      return workspaceFileReadsAt(this.#storage.sql, commit, input);
    });
  }

  referencesReachable(contextIds: readonly string[], references: readonly VcsSemanticNodeRef[]) {
    return this.#run(async () => {
      const { sql } = this.#storage;
      const requested = new Set(contextIds.map((id) => this.#contextBranch(id)));
      const tips = [...new Set(this.#dolt.branch.list()
        .filter(({ name }) => requested.has(name))
        .map(({ hash }) => hash))];
      if (tips.length === 0) return false;
      const unresolved = references.filter((ref) =>
        !tips.some((tip) => workspaceReferenceAt(sql, tip, ref)),
      );
      if (unresolved.length === 0) return true;
      const main = await this.#fetchMain();
      return !tips.includes(main) && unresolved.every((ref) => workspaceReferenceAt(sql, main, ref));
    });
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
      const sources = applications.length === 0 ? [] : workspaceMergeSourcesAt(sql, head, saved.head, applications);
      return {
        contextId,
        committed: { kind: "event", eventId: saved.eventId },
        workingHead: state,
        clean: saved.head === head,
        mainEventId: mainEvent.eventId,
        mainRelation,
        workingCounts: { applications: applications.length, workUnits, changes },
        integrating: sources.map((eventId) => ({
          source: { kind: "event", eventId },
          remainingCoordinateCount: 0,
          mergeableCoordinateCount: 0,
          conflictCoordinateCount: 0,
          concluded: true,
          asOfWorkingHead: state,
          stale: false,
        })),
      };
    });
  }

  #contextState(contextId: string) {
    const { sql } = this.#storage;
    const head = this.#dolt.hashOf(this.#contextBranch(contextId));
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
  ): Promise<HistoryEditPlan> {
    return this.#run(() => {
      if (command.commandId !== edit.commandId || command.method !== "edit") {
        throw new SemanticVcsError("IntegrityFailure", "Workspace edit and command differ");
      }
      const current = this.#dolt.hashOf(this.#contextBranch(edit.contextId));
      if (this.#hasCommand(current, edit.contextId, command)) {
        return this.#committedEdit(current, edit.contextId, command.commandId);
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
        command,
        application: { ...prepared.plan, placement: prepared.placement },
        blobs: draft.blobs ?? [],
        result: prepared.result,
      };
    });
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

  #committedEdit(at: string, contextId: string, commandId: string): HistoryEditPlan {
    const { sql } = this.#storage;
    const { workingHead, workUnitId, head } = this.#applicationForCommand(at, commandId);
    const changes = sql.exec(
      `SELECT change_id FROM dolt_at_gad_changes(?)
        WHERE work_unit_id = ? ORDER BY operation, ordinal`,
      at,
      workUnitId,
    ).toArray();
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
        incorporatedChangeCount: 0,
        incorporatedChangeIds: [],
        decisionIds: [],
      },
    };
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

  /** Discard only the selected unsaved applications and keep the exact retry receipt. */
  discardWorkingContext(
    head: string,
    input: VcsDiscardInput,
    cause: HistoryCommand["cause"],
  ): Promise<HistoryDiscardReceipt["result"]> {
    return this.#run(() => {
      const journal = this.#discardJournal;
      if (!journal) throw new Error("Workspace discard requires local receipt storage");
      const { commandId, contextId } = input;
      const requestDigest = compactId("discard-request", { head, input, cause });
      const key = discardReceiptKey(commandId);
      const stored = journal.get(key);
      if (stored !== null) {
        const receipt = JSON.parse(stored) as HistoryDiscardReceipt;
        if (receipt.requestDigest !== requestDigest) {
          throw new SemanticVcsError("CommandIdReuse", "Workspace discard command has changed");
        }
        return receipt.result;
      }
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
    const journal = this.#discardJournal;
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
      const { sql } = this.#storage;
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
        validateApplicationPlan(plan);
        if (
          stateNodeKey(plan.expectedWorkingHead) !== stateNodeKey(application.basis) ||
          workspaceCommitForRef(sql, expectedHead, application.basis) !== expectedHead
        ) {
          throw new SemanticVcsError("RevisionChanged", "Prepared workspace revision has changed");
        }
        if (plan.placement === undefined) {
          throw new SemanticVcsError("IntegrityFailure", "Prepared workspace placement is missing");
        }
        if (plan.placement !== null) applyDoltWorkspaceState(sql, plan.placement);
        this.#recordCommand(contextId, command, workUnit.createdAt);
        this.#persistApplication(plan);
        return value;
      });
    });
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
    provenance.persistWorkUnit(plan.workUnit);
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
      if (input.concludes) {
        throw new SemanticVcsError("IntegrationIncomplete", "Workspace integration needs a completed decision");
      }
      if (applicationIds.length === 0) {
        throw new SemanticVcsError("RevisionChanged", "Nothing is working");
      }
      const expected = input.expectedWorkingHead;
      if (expected.kind !== "application" ||
          applicationIds.at(-1) !== expected.applicationId ||
          workspaceCommitForRef(sql, current, expected) !== current) {
        throw new SemanticVcsError("RevisionChanged", "Workspace save names a different working revision");
      }
      const sources = workspaceMergeSourcesAt(sql, current, parent.head, applicationIds);
      const kind: WorkspaceEventRecord["kind"] = sources.length > 0 ? "integration-commit" : "commit";
      const fields = {
        commandId,
        kind,
        parentEventIds: [parent.eventId, ...sources],
        externalDeltaIds: [],
        applicationIds,
        resultWorkspaceFactRootId: current,
        message: input.message ?? null,
        createdAt: new Date().toISOString(),
      };
      const event: WorkspaceEventRecord = {
        ...fields,
        eventId: compactId("workspace-event", fields),
        snapshotSource: null,
      };
      const result = this.#saveResult(contextId, event.eventId, applicationIds, sources);
      const { head } = this.#commit(contextId, expectedHead, input.message ?? "Save workspace revision", () => {
        this.#recordCommand(contextId, command, event.createdAt);
        recordDoltWorkspaceEvent(sql, event);
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
    if (rows[0]?.["kind"] !== (sources.length > 0 ? "integration-commit" : "commit")) {
      throw new SemanticVcsError("IntegrityFailure", "Recorded save kind differs from its native ancestry");
    }
    return { head, result: this.#saveResult(contextId, eventId, applications, sources) };
  }

  #saveResult(contextId: string, eventId: string, applicationIds: string[], sources: string[]): VcsCommitResult {
    return {
      contextId,
      event: { kind: "event", eventId },
      committedApplicationIds: applicationIds,
      integrationSourceEventIds: sources,
      integrationSourceDeltaIds: [],
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
    return this.#previewMerge(contextId, head, () => this.#fetchExpectedMain(expectedMain));
  }

  async previewContextMerge(contextId: string, head: string, source: MergeSource) {
    const { main, ...preview } = await this.#previewMerge(
      contextId, head, () => this.#resolveContextSource(source),
    );
    return { ...preview, source: main };
  }

  #previewMerge(contextId: string, head: string, readSource: () => Promise<string>): Promise<MainMergePreview> {
    return this.#run(async () => {
      this.#assertHead(this.#contextBranch(contextId), head);
      const main = await readSource();
      const base = this.#mergeBase(head, main);
      if (!base) {
        throw new SemanticVcsError("InvalidReference", "Workspace source and context share no history");
      }
      if (base === head || base === main) {
        return { head, main, base, incoming: [], conflicts: [], violations: [] };
      }
      const incoming = [...workspaceMergeScope(this.#storage.sql, base, main).values()];
      this.#checkoutExpected(contextId, head);
      const rollback = new Error("Workspace merge preview complete");
      let preview: MainMergePreview | undefined;
      try {
        this.#dolt.merge(main, {
          fastForward: false,
          resolve(merge) {
            if (merge.ours !== head || merge.theirs !== main || merge.base !== base) {
              throw new Error("Workspace merge preview changed its selected revisions");
            }
            preview = {
              head, main, base, incoming,
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
      }
      if (!preview || this.#dolt.hashOf(this.#contextBranch(contextId)) !== head) {
        throw new Error("Workspace merge preview changed the working revision");
      }
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
        requestDigest: compactId("merge-request", { selection, input, ...(sourceContext ? { sourceContext } : {}) }),
        cause,
      };
      const current = this.#dolt.hashOf(this.#contextBranch(contextId));
      if (this.#hasCommand(current, contextId, command)) {
        const { head, workingHead } = this.#applicationForCommand(current, commandId);
        return { kind: "committed", value: workingHead, head };
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
        : await this.#fetchExpectedMain(selection.main);
      const base = this.#mergeBase(head, main);
      const source = committedWorkspaceEvent(sql, main);
      if (!base || base !== selection.base || base === head || base === main ||
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
          const { plan } = SemanticWorkspace.prepareApplication(input, draft, commandId, {
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
      return { kind: "committed", value, head: merged.hash };
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

  async #resolveReadableState(contextId: string, ref: StateNodeRef): Promise<string | null> {
    const local = this.#resolveState(contextId, ref);
    if (local) return local;
    const main = await this.#fetchMain();
    return workspaceCommitForRef(this.#storage.sql, main, ref);
  }

  #commit<T>(contextId: string, expectedHead: string, message: DoltCommitMessage, write: () => T) {
    const branch = this.#checkoutExpected(contextId, expectedHead);
    const value = this.#storage.transactionSync(write, { commit: message });
    return { value, head: this.#dolt.hashOf(branch) };
  }

  #hasCommand(at: string, contextId: string, command: HistoryCommand): boolean {
    if (this.#discardJournal?.get(discardReceiptKey(command.commandId)) != null) {
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

  async #fetchMain(): Promise<string> {
    const { branches } = await this.#dolt.fetch("origin", {
      branches: ["main"],
      transport: this.#transport,
    });
    const head = branches["main"];
    if (!head) throw new Error("Canonical GAD main is unavailable");
    return head;
  }

  async #fetchExpectedMain(expected: string): Promise<string> {
    const main = await this.#fetchMain();
    if (main !== expected) throw new HistoryHeadChanged(expected, main);
    return main;
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
