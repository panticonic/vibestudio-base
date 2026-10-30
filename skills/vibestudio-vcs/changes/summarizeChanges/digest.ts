/** Reduce a `vcs.compare` result to the changes the source side makes, grouped by repository. Exact work only. */
import type {
  ChangeDigest,
  ChangedFile,
  Compare,
  UnitChange,
} from "../types.js";

/** The repository a path belongs to: the first two segments (`packages/source`, `panels/chat`). */
function unitOf(path: string): string {
  return path.split("/").slice(0, 2).join("/");
}

/** The change one coordinate makes on the source side, or null when the source side does not change it. */
function changeOf(entry: Compare["coordinates"][number]): ChangedFile | null {
  const { base, theirs } = entry.coordinate.paths;
  const aspects = entry.aspects.map((aspect) => aspect.aspect);
  const common = { status: entry.status };
  if (base === undefined && theirs !== undefined)
    return { path: theirs, change: "added", unit: unitOf(theirs), ...common };
  if (base !== undefined && theirs === undefined)
    return { path: base, change: "deleted", unit: unitOf(base), ...common };
  if (base === undefined || theirs === undefined) return null;
  if (base !== theirs)
    return {
      path: theirs,
      change: "moved",
      from: base,
      unit: unitOf(theirs),
      ...common,
    };
  if (aspects.includes("content"))
    return { path: theirs, change: "edited", unit: unitOf(theirs), ...common };
  if (aspects.includes("mode"))
    return {
      path: theirs,
      change: "mode-changed",
      unit: unitOf(theirs),
      ...common,
    };
  return null;
}

export default function digest(compare: Compare): ChangeDigest {
  const changed = compare.coordinates.flatMap((entry) => {
    const change = changeOf(entry);
    return change ? [{ id: entry.coordinate.id, change }] : [];
  });
  const tierRank = { stated: 0, trigger: 1, mechanical: 2 } as const;
  const intents = compare.intents
    .filter((entry) => entry.side === "theirs")
    .map((entry) => ({
      text: entry.intent.text,
      tier: entry.intent.tier,
      covers: entry.coordinates.map((coordinate) => coordinate.id),
    }))
    .sort((left, right) => tierRank[left.tier] - tierRank[right.tier]);
  const units: UnitChange[] = [];
  for (const { id, change } of changed) {
    let unit = units.find((known) => known.unit === change.unit);
    if (!unit) {
      unit = { unit: change.unit, files: [], intents: [] };
      units.push(unit);
    }
    unit.files.push(change);
    for (const intent of intents) {
      if (
        intent.covers.includes(id) &&
        !unit.intents.some((known) => known.text === intent.text)
      )
        unit.intents.push({ text: intent.text, tier: intent.tier });
    }
  }
  return {
    units,
    intents: intents.map(({ text, tier }) => ({ text, tier })),
    fileCount: changed.length,
    truncated: compare.intentsTruncated || compare.nextCursor !== null,
  };
}
