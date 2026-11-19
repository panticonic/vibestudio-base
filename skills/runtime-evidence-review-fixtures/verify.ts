import { isDeepStrictEqual } from "node:util";
import type { RuntimeEvidenceReport } from "../runtime-evidence-review/types.js";
import type { RuntimeEvidenceWorld } from "./worlds.js";

export function verifyRuntimeEvidence(
  world: RuntimeEvidenceWorld,
  report: RuntimeEvidenceReport,
) {
  const exact = isDeepStrictEqual(world.expected, report);
  return { passed: exact, checks: { exact } };
}
