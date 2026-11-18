import { sha256HexSyncText } from "@vibestudio/content-addressing";
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
import { serializeByKey } from "@vibestudio/shared/keyedSerializer";
import { committedWorkspaceEvent } from "./doltWorkspaceState.js";

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

interface MergeSource extends CommittedContext {
  readonly participantId?: string;
}

type WorkspaceStorage = DoltCapableStorage & { readonly sql: SqlStorage };

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
): DoltGrant {
  const participant = branchSegment(participantId);
  return canonical.remote.grant({
    label: participant,
    fetch: true,
    branches: ["main", "pub/*"],
    push: [`pub/${participant}/*`],
  });
}

/** Run after stopping new turns and resolving the participant's committed tips. */
export async function retireParticipantHistory(
  canonical: DoltRemoteStorage,
  participantId: string,
  archive: (token: string, main: string) => Promise<void>,
  destroy: () => Promise<void>,
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
  });
  try {
    await archive(grant.token, canonical.hashOf("main"));
  } finally {
    canonical.remote.revoke(grant.id);
  }
  for (const grant of canonical.remote.grants()) {
    if (grant.label === participant) canonical.remote.revoke(grant.id);
  }
  await destroy();
}

/**
 * The canonical owner calls this after verifying the publication receipt.
 * Dolt enforces the same two heads when the grant is used by any carrier.
 */
export function grantApprovedMain(
  canonical: DoltRemoteStorage,
  publication: MainPublication,
): DoltGrant {
  const actual = canonical.hashOf("main");
  if (actual !== publication.previousHead) {
    throw new HistoryHeadChanged(publication.previousHead, actual);
  }
  const pushTransition = {
    previous: publication.previousHead,
    next: publication.proposedHead,
  };
  const grant = canonical.remote.grant({ push: ["main"], pushTransition });
  if (
    grant.pushTransition?.previous !== pushTransition.previous ||
    grant.pushTransition.next !== pushTransition.next
  ) {
    canonical.remote.revoke(grant.id);
    throw new Error("GAD publication requires Dolt push transitions");
  }
  return grant;
}

export class HistoryHeadChanged extends Error {
  constructor(
    readonly expected: string,
    readonly actual: string,
  ) {
    super("The workspace history head has changed");
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

  constructor(
    participantId: string,
    storage: WorkspaceStorage,
    transport: DoltRemoteTransport,
  ) {
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

  forkContext(
    parentId: string,
    expectedHead: string,
    childId: string,
  ): Promise<string> {
    return this.#run(() => {
      this.#assertHead(this.#contextBranch(parentId), expectedHead);
      return this.#openBranch(childId, expectedHead);
    });
  }

  discard(
    contextId: string,
    expectedHead: string,
    committedHead: string,
  ): Promise<string> {
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
    write: () => T,
  ): Promise<{ readonly value: T; readonly head: string }> {
    return this.#run(() => {
      const branch = this.#checkoutExpected(contextId, expectedHead);
      const value = this.#storage.transactionSync(write, { commit: message });
      return { value, head: this.#dolt.hashOf(branch) };
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
    options: ResolvingMerge,
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
    grantTarget: DoltRemoteTarget,
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
    grantTarget: DoltRemoteTarget,
  ): Promise<void> {
    return this.#run(async () => {
      const remote = "retirement";
      this.#configureRemote(remote, grantTarget);
      try {
        await this.#dolt.fetch(remote, {
          branches: ["main"],
          transport: this.#transport,
        });
        // Resolve and check all tips before publishing anything. Applications
        // after a committed tip can already be stored on the context branch.
        const archives = contexts.flatMap(({ contextId, head }) => {
          const context = this.#contextBranch(contextId);
          const committed = this.#dolt.hashOf(head);
          if (committed !== this.#mergeBase(context, committed)) {
            throw new Error(`Committed tip is outside context ${contextId}`);
          }
          if (committed === this.#mergeBase(main, committed)) return [];
          const branch = `retired/${this.#participant}/${context.slice("ctx/".length)}`;
          return [{ branch, committed }];
        });
        for (const { branch, committed } of archives) {
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
    });
  }

  #mergeBase(left: string, right: string): string | null {
    const base = this.#dolt.query("SELECT dolt_merge_base(?1, ?2)", [
      { index: 1, value: left },
      { index: 2, value: right },
    ]).rows[0]?.[0];
    if (typeof base === "string" || base === null) return base;
    throw new Error("GAD merge base query did not return a hash");
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
    if (
      !this.#dolt.branch.list().some((candidate) => candidate.name === branch)
    ) {
      this.#dolt.branch.create(branch, { from: at });
    }
    return this.#dolt.hashOf(branch);
  }

  #assertHead(branch: string, expectedHead: string): void {
    const actual = this.#dolt.hashOf(branch);
    if (actual !== expectedHead)
      throw new HistoryHeadChanged(expectedHead, actual);
  }

  #checkoutExpected(contextId: string, expectedHead: string): string {
    const branch = this.#contextBranch(contextId);
    this.#assertHead(branch, expectedHead);
    if (this.#dolt.branch.current() !== branch) this.#dolt.checkout(branch);
    return branch;
  }
}
