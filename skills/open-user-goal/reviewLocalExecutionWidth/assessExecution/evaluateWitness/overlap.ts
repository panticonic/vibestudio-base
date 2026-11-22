import type { WidthReceipt } from "../../contract.js";

/** Count overlapping completed jobs, observing half-open execution intervals. */
export function countOverlap(receipt: WidthReceipt, minimumContext: number, needsTools: boolean): number | null {
  const seen = new Set<string>();
  const edges: { time: number; change: number }[] = [];
  for (const interval of receipt.intervals) {
    if (interval.terminal !== "complete" || interval.end <= interval.start || interval.contextTokens < minimumContext ||
        (needsTools && !interval.usedTools) || seen.has(interval.id)) continue;
    seen.add(interval.id);
    edges.push({ time: interval.start, change: 1 }, { time: interval.end, change: -1 });
  }
  edges.sort((left, right) => left.time - right.time || left.change - right.change);
  let active = 0;
  let maximum = 0;
  for (const edge of edges) {
    active += edge.change;
    maximum = Math.max(maximum, active);
  }
  return edges.length ? maximum : null;
}
