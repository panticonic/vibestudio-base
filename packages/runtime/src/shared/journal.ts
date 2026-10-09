import type { NativeBlobTreeObservation } from "@vibestudio/service-schemas/blobstore";
import {
  EVAL_OPERATION_JOURNAL_MAX_ENTRIES,
  EVAL_RESULT_RETURN_PREVIEW_CHARS,
} from "@vibestudio/service-schemas/eval";

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

/** Copy bounded native values so guest mutations cannot alter completed evidence. */
export function cdpEvaluationReceipt(value: unknown) {
  const encoded = JSON.stringify(value) ?? "null";
  const truncated = encoded.length > EVAL_RESULT_RETURN_PREVIEW_CHARS;
  return {
    protocol: "cdp-evaluation-outcome.v1" as const,
    capturedAt: Date.now(),
    value: truncated ? null : (JSON.parse(encoded) as unknown),
    truncated,
  };
}

/** Operation evidence is not a DOM inspection dump. Keep the exact action,
 * target identity and assertion; callers still receive the rich click result. */
export function cdpInteractionReceipt(
  outcome: import("@workspace/cdp-client").CdpInteractionOutcome,
) {
  const { selector, found, tagName, id, role, accessibleName } = outcome.target;
  return {
    protocol: outcome.protocol,
    action: outcome.action,
    delivery: outcome.delivery,
    target: { selector, found, tagName, id, role, accessibleName },
    effect: { ...outcome.effect },
  };
}

/** Retain measured aggregates, not request URLs, labels, or coverage source data. */
export function cdpProfileReceipt(
  report: import("@workspace/cdp-client").CdpProfileReport,
) {
  return {
    protocol: "cdp-profile-outcome.v1" as const,
    capturedAt: Date.now(),
    elapsedMs: report.elapsedMs,
    runtime: { ...report.runtime },
    page: {
      ...report.page,
      ...(report.page.navigation
        ? { navigation: { ...report.page.navigation } }
        : {}),
      longTasks: { ...report.page.longTasks },
    },
    network: {
      requestCount: report.network.requestCount,
      failedCount: report.network.failedCount,
      transferBytes: report.network.transferBytes,
    },
  };
}

export type OperationJournalEntry =
  | {
      type: "blob-tree.observation";
      receipt: Extract<
        NativeBlobTreeObservation,
        { method: "materializeTree" }
      >;
    }
  | { type: "open"; source: string; id: string; kind: "workspace" | "browser" }
  | { type: "reload"; id: string }
  | { type: "close"; id: string }
  | { type: "interaction"; id: string; receipt: unknown }
  | { type: "profile.start"; id: string }
  | {
      type: "profile";
      id: string;
      receipt: ReturnType<typeof cdpProfileReceipt>;
    }
  | {
      type: "cdp.session";
      id: string;
      receipt: {
        status: "acquired" | "current" | "reconnected" | "replaced";
        generation: import("../core/types.js").PanelCdpGeneration;
        previousGeneration?: import("../core/types.js").PanelCdpGeneration;
      };
    }
  | {
      type: "evaluation";
      id: string;
      receipt: ReturnType<typeof cdpEvaluationReceipt>;
    }
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
  | { type: "stateArgs.patch"; id: string };

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
