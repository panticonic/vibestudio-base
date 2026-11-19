import type { PanelHandle } from "@workspace/runtime";
import type {
  PanelHealthObservation,
  PanelHealthSignal,
} from "../panel-health/types.js";

type PanelScope = {
  contextId: string;
  source: string;
  markerIds: readonly string[];
};
type ReadablePanel = Pick<PanelHandle, "id" | "diagnose" | "observe" | "cdp">;

export function bindPanelHealth(
  handle: ReadablePanel,
  scope: PanelScope,
  waitForLater?: (before: Readonly<PanelHealthObservation>) => Promise<void>,
) {
  const markerIds = [...new Set(scope.markerIds)];
  let previous: PanelHealthObservation | undefined;
  let reading = false;

  async function readMarkers() {
    const session = await handle.cdp.session();
    try {
      const ids = JSON.stringify(markerIds);
      return await session.page.evaluate<PanelHealthObservation["markers"]>(
        `(() => {
          const ids = ${ids};
          const marked = Array.from(document.querySelectorAll("[data-panel-health]"));
          return ids.flatMap(id => {
            const nodes = marked.filter(node => node.getAttribute("data-panel-health") === id);
            if (!nodes.length) return [];
            return [{ id, values: nodes.map(node => node.textContent.trim()) }];
          });
        })()`,
      );
    } finally {
      await session.close();
    }
  }

  async function read(afterSequence = 0): Promise<PanelHealthObservation> {
    const { observation, consoleHistory } = await handle.diagnose();
    if (
      observation.panelId !== handle.id ||
      observation.contextId !== scope.contextId ||
      observation.kind !== "workspace" ||
      observation.source !== scope.source
    ) {
      throw new Error(
        "The inspected renderer is outside the assigned panel scope",
      );
    }
    const markers = observation.phase === "ready" ? await readMarkers() : [];
    const verified = await handle.observe();
    if (
      verified.panelId !== observation.panelId ||
      verified.attemptId !== observation.attemptId ||
      verified.buildKey !== observation.buildKey ||
      verified.phase !== observation.phase
    ) {
      throw new Error("The renderer changed during inspection");
    }
    const signals = new Map<number, PanelHealthSignal>();
    let consoleThrough = afterSequence;
    let dropped = consoleHistory.available
      ? consoleHistory.dropped.errors + Number(consoleHistory.page.hasOlder)
      : 1;
    if (consoleHistory.available) {
      const rows = [...consoleHistory.entries, ...consoleHistory.errors];
      for (const row of rows) {
        if (typeof row.seq !== "number") {
          if (row.level === "error") dropped += 1;
          continue;
        }
        consoleThrough = Math.max(consoleThrough, row.seq);
        if (
          row.seq <= afterSequence ||
          (row.level !== "error" &&
            row.level !== "warning" &&
            row.level !== "info")
        )
          continue;
        signals.set(row.seq, {
          sequence: row.seq,
          level: row.level,
          message: row.message,
        });
      }
    }
    return {
      id: crypto.randomUUID(),
      panelId: handle.id,
      attemptId: observation.attemptId,
      buildKey: observation.buildKey ?? "",
      phase:
        observation.phase === "ready" || observation.phase === "failed"
          ? observation.phase
          : "pending",
      markers,
      diagnostics: [...signals.values()].sort(
        (a, b) => a.sequence - b.sequence,
      ),
      consoleThrough,
      dropped,
    };
  }

  async function exclusive(run: () => Promise<PanelHealthObservation>) {
    if (reading) throw new Error("Another panel inspection is in progress");
    reading = true;
    try {
      previous = await run();
      return structuredClone(previous);
    } finally {
      reading = false;
    }
  }

  return {
    panelHealth: {
      observe: () => exclusive(() => read()),
      observeAfter: (snapshotId: string) =>
        exclusive(async () => {
          if (!waitForLater || !previous || previous.id !== snapshotId) {
            throw new Error(
              "The follow-up does not match the assigned observation",
            );
          }
          const basis = previous;
          await waitForLater(structuredClone(basis));
          return await read(basis.consoleThrough);
        }),
    },
  };
}
