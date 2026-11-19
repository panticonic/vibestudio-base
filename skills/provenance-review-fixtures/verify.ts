import { isDeepStrictEqual } from "node:util";
import type { ProvenanceReport } from "../provenance-orientation/types.js";
import type { ProvenanceWorld } from "./worlds.js";
export function verifyProvenanceWorld(
  world: ProvenanceWorld,
  report: ProvenanceReport,
) {
  const expected = world.expected;
  // Independent support references form a set; copy and merge origin references are ordered.
  const normalize = (value: ProvenanceReport) =>
    value.kind === "constraint"
      ? { ...value, evidence: [...value.evidence].sort() }
      : value;
  const exact = isDeepStrictEqual(normalize(report), normalize(expected));
  return { passed: exact, checks: { exact } };
}
