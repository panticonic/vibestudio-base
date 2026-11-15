import type { Seq, StorageWrite } from "@panticonic/pi-durable";

/** What a commit message of an agent cell is made of: a fixed prefix, the turn, and how much of the conversation it holds. */
const TURN_COMMIT_PREFIX = "agent: turn closed ";

/** The entry high-water mark a turn commit holds, read back from its message. Null for any other commit. */
export function turnCommitEntryHigh(message: string): number | null {
  if (!message.startsWith(TURN_COMMIT_PREFIX)) return null;
  const match = /entries<=(\d+)$/u.exec(message);
  return match ? Number(match[1]) : null;
}

interface PublicationEvents {
  readonly events?: ReadonlyArray<{ readonly event?: { readonly kind?: unknown; readonly turnId?: unknown } }>;
}

/**
 * The Dolt commit of an agent cell. A turn is closed by the storage transaction that creates the pending publication
 * of its `turn.closed` event, so that transaction ends in a commit: it sweeps in everything the turn wrote (entries,
 * the documents that are conversation knowledge) and names how much of the conversation it holds. Nothing else commits:
 * a commit per Pi write would cost a root record per write for nothing a fork could ask for. `versionedChangesPending`
 * reads the engine's status of the versioned tables (the SQL table `dolt_status`, which a transaction may read).
 *
 * The commit is found again by `turnCommitEntryHigh` when a fork asks for the last closed turn at or before a
 * conversation entry.
 */
export function nativeAgentCommitPolicy(
  versionedChangesPending: () => boolean,
): (
  writes: readonly StorageWrite[],
  seq: Seq,
  state: { readonly entryHigh: number },
) => string | null {
  return (writes, _seq, state) => {
    for (const write of writes) {
      if (write.type !== "task" || write.value.kind !== "vibestudio.channel-publication") continue;
      if (write.value.state.status !== "pending") continue;
      const closed = (write.value.input as PublicationEvents | null)?.events?.find(
        (item) => item.event?.kind === "turn.closed",
      );
      if (!closed) continue;
      // The engine refuses a commit with nothing to commit: a turn that changed no versioned row ends without one.
      if (!versionedChangesPending()) return null;
      const turn = typeof closed.event?.turnId === "string" ? closed.event.turnId : "unknown";
      return `${TURN_COMMIT_PREFIX}${turn} entries<=${state.entryHigh}`;
    }
    return null;
  };
}

/** What the cell's version history offers a fork: the commit and how much of the conversation it holds. */
export interface TurnCommit {
  readonly commit: string;
  readonly entryHigh: number;
}

/**
 * The newest turn commit of the cell that holds no entry beyond `at` (the greatest entry the channel prefix accounts
 * for): the last closed turn at or before it, the granularity the trajectory re-root rule already has. With no entry
 * accounted for (`at` is null) it is the state before the first turn closed.
 */
export function lastTurnCommitThrough(
  dolt: {
    log(options?: { limit?: number }): ReadonlyArray<{ readonly hash: string; readonly message: string }>;
    hashOf(ref: string): string;
  },
  at: number | null,
): TurnCommit {
  const log = dolt.log({ limit: 1_000_000 });
  let oldest: { readonly hash: string } | null = null;
  for (const commit of log) {
    const entryHigh = turnCommitEntryHigh(commit.message);
    if (entryHigh === null) continue;
    oldest = commit;
    if (at !== null && entryHigh <= at) return { commit: commit.hash, entryHigh };
  }
  // Every turn commit holds something beyond `at`: the cell as it was before the first one closed holds nothing of it.
  if (oldest !== null) return { commit: dolt.hashOf(`${oldest.hash}~1`), entryHigh: 0 };
  return { commit: dolt.hashOf("HEAD"), entryHigh: 0 };
}
