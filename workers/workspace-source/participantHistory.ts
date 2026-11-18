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

type ResolvingMerge = DoltMergeOptions & {
  readonly resolve: NonNullable<DoltMergeOptions["resolve"]>;
};

export interface MainPublication {
  readonly previousHead: string;
  readonly proposedHead: string;
}

function branchSegment(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/u.test(value) || value.includes("..")) {
    throw new Error("Invalid GAD branch segment");
  }
  return value;
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
 * Branch operations for one participant's fork of the canonical GAD store.
 * The owning cell serializes calls, including publication and grant changes.
 */
export class ParticipantHistory {
  readonly #participant: string;
  readonly #storage: DoltCapableStorage;
  readonly #dolt: DoltRemoteStorage;
  readonly #transport: DoltRemoteTransport;

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

  connect(origin: DoltRemoteTarget): void {
    this.#dolt.remote.add("origin", origin);
  }

  openContext(contextId: string, at: string): string {
    const branch = this.#contextBranch(contextId);
    if (!this.#dolt.branch.list().some((candidate) => candidate.name === branch)) {
      this.#dolt.branch.create(branch, { from: at });
    }
    return this.#dolt.hashOf(branch);
  }

  commit<T>(
    contextId: string,
    expectedHead: string,
    message: DoltCommitMessage,
    write: () => T,
  ): { readonly value: T; readonly head: string } {
    const branch = this.#checkoutExpected(contextId, expectedHead);
    const value = this.#storage.transactionSync(write, { commit: message });
    return { value, head: this.#dolt.hashOf(branch) };
  }

  async mergeMain(contextId: string, expectedHead: string, options: ResolvingMerge) {
    const fetched = await this.#dolt.fetch("origin", {
      branches: ["main"],
      transport: this.#transport,
    });
    if (!fetched.branches.main) throw new Error("Canonical GAD main is unavailable");
    this.#checkoutExpected(contextId, expectedHead);
    return this.#dolt.merge("origin/main", options);
  }

  publishContext(contextId: string, expectedHead: string) {
    const branch = this.#contextBranch(contextId);
    this.#assertHead(branch, expectedHead);
    return this.#dolt.push("origin", branch, {
      to: `pub/${this.#participant}/${contextId}`,
      transport: this.#transport,
    });
  }

  async publishApprovedMain(
    contextId: string,
    publication: MainPublication,
    grantTarget: DoltRemoteTarget,
    transport: DoltRemoteTransport,
  ) {
    const branch = this.#contextBranch(contextId);
    this.#assertHead(branch, publication.proposedHead);
    this.#dolt.remote.add("approved-main", grantTarget);
    try {
      return await this.#dolt.push("approved-main", branch, { to: "main", transport });
    } finally {
      this.#dolt.remote.remove("approved-main");
    }
  }

  #contextBranch(contextId: string): string {
    return `ctx/${branchSegment(contextId)}`;
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
