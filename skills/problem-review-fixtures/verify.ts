import { isDeepStrictEqual } from "node:util";
import type { ProblemReviewReport } from "../problem-reporting/natlang/types.js";
import type { ProblemWorld } from "./worlds.js";

export function verifyProblemWorld(
  world: ProblemWorld,
  report: ProblemReviewReport,
) {
  const exact = isDeepStrictEqual(report, world.expected);
  return { passed: exact, checks: { exact } };
}
