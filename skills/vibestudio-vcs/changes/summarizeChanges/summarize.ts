/** A reviewer's summary of a compare result: exact state and attention list, a sentence per repository. */
import digest from "./digest.js";
import commitSubject from "./commitSubject.nl";
import describeUnit from "./describeUnit.nl";
import type { ChangeSummary, Compare } from "../types.js";

export default async function summarize(
  compare: Compare,
): Promise<ChangeSummary> {
  const changes = digest(compare);
  const [headline, sentences] = await Promise.all([
    changes.fileCount === 0
      ? Promise.resolve("No changes.")
      : commitSubject(changes),
    Promise.all(changes.units.map((unit) => describeUnit(unit))),
  ]);
  const state =
    compare.counts.conflict > 0
      ? "conflicts"
      : !compare.resolution.complete || compare.counts.composed > 0
        ? "decisions-needed"
        : "ready";
  const attention = compare.coordinates.flatMap((entry) =>
    entry.status === "conflict" || entry.status === "composed"
      ? [
          {
            path:
              entry.coordinate.paths.theirs ??
              entry.coordinate.paths.base ??
              entry.coordinate.paths.ours ??
              entry.coordinate.id,
            why: entry.status,
          },
        ]
      : [],
  );
  return {
    headline: headline.trim(),
    units: changes.units.map((unit, index) => ({
      unit: unit.unit,
      files: unit.files,
      what: sentences[index]!.trim(),
    })),
    state,
    attention,
    truncated: changes.truncated,
  };
}
