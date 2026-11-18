import { sha256HexSyncText } from "@vibestudio/content-addressing";
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

type ResolvingMerge = DoltMergeOptions & {
  readonly resolve: NonNullable<DoltMergeOptions["resolve"]>;
};

export interface MainPublication {
  readonly previousHead: string;
  readonly proposedHead: string;
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

/**
 * The canonical owner calls this with the previous head from its verified
 * publication receipt. The comparison and Dolt's remote update share a turn.
 */
export function serveApprovedMain(
  canonical: DoltRemoteStorage,
  publication: MainPublication,
  request: Uint8Array,
): Uint8Array {
  const actual = canonical.hashOf("main");
  if (actual !== publication.previousHead) {
    throw new HistoryHeadChanged(publication.previousHead, actual);
  }
  return canonical.remote.serve(request);
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
  readonly #storage: DoltCapableStorage;
  readonly #dolt: DoltRemoteStorage;
  readonly #transport: DoltRemoteTransport;
  readonly #turns = new Map<string, Promise<unknown>>();

  constructor(
    participantId: string,
    storage: DoltCapableStorage,
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
      this.#dolt.remote.add("origin", origin);
      return this.#fetchMain();
    });
  }

  openContext(contextId: string, at: string): Promise<string> {
    return this.#run(() => this.#openBranch(contextId, at));
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
      this.#checkoutExpected(contextId, expectedHead);
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
    transport: DoltRemoteTransport,
  ) {
    return this.#run(async () => {
      const branch = this.#contextBranch(contextId);
      this.#assertHead(branch, publication.proposedHead);
      this.#dolt.remote.add("approved-main", grantTarget);
      try {
        return await this.#dolt.push("approved-main", branch, {
          to: "main",
          transport,
        });
      } finally {
        this.#dolt.remote.remove("approved-main");
      }
    });
  }

  #run<T>(turn: () => T | Promise<T>): Promise<T> {
    return serializeByKey(this.#turns, this.#participant, turn);
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
