import { EVAL_OPERATION_JOURNAL_MAX_ENTRIES } from "@vibestudio/service-schemas/eval";

export function consoleHistoryReceipt(
  history: import("@vibestudio/shared/panel/observation").PanelConsoleHistoryResult,
  options?: import("../core/types.js").PanelConsoleHistoryOptions,
) {
  const unfiltered = Object.keys(options ?? {}).every(
    (key) => key === "limit" || key === "errorLimit",
  );
  return {
    capturedAt: Date.now(),
    errorCount: history.errors.length,
    droppedErrors: history.dropped.errors,
    errorCoverage:
      unfiltered && options?.errorLimit !== 0
        ? ("full" as const)
        : ("filtered" as const),
  };
}

export type OperationJournalEntry =
  | { type: "open"; source: string; id: string; kind: "workspace" | "browser" }
  | { type: "reload"; id: string }
  | { type: "close"; id: string }
  | { type: "interaction"; id: string; receipt: unknown }
  | {
      type: "snapshot";
      id: string;
      receipt: Omit<
        import("@vibestudio/shared/panel/observation").PanelSnapshotObservation,
        "document"
      > & { documentKind: "synth" };
    }
  | {
      type: "consoleHistory";
      id: string;
      receipt: ReturnType<typeof consoleHistoryReceipt>;
    }
  | {
      type: "screenshot";
      id: string;
      receipt: {
        capturedAt: number;
        mimeType: "image/png" | "image/jpeg";
        width?: number;
        height?: number;
        byteSize: number;
      };
    }
  | { type: "stateArgs.set"; id: string };

export class Journal {
  readonly entries: OperationJournalEntry[] = [];
  truncated = false;

  append(entry: OperationJournalEntry): void {
    if (this.entries.length >= EVAL_OPERATION_JOURNAL_MAX_ENTRIES) {
      this.truncated = true;
      return;
    }
    this.entries.push(entry);
  }
}

const active = new Map<Journal, number>();
const fanoutJournal: Journal = {
  get entries() {
    return [];
  },
  get truncated() {
    return [...active.keys()].some((journal) => journal.truncated);
  },
  append(entry: OperationJournalEntry): void {
    for (const journal of active.keys()) {
      journal.append(entry);
    }
  },
};

export async function withJournal<T>(
  journal: Journal,
  fn: () => Promise<T> | T,
): Promise<T> {
  active.set(journal, (active.get(journal) ?? 0) + 1);
  try {
    return await fn();
  } finally {
    const count = active.get(journal) ?? 0;
    if (count <= 1) active.delete(journal);
    else active.set(journal, count - 1);
  }
}

export function currentJournal(): Journal | null {
  return active.size > 0 ? fanoutJournal : null;
}
