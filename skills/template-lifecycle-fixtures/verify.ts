import { isDeepStrictEqual } from "node:util";
import type { TemplateLifecycleReport } from "../templates/types.js";
import type { TemplateWorld } from "./worlds.js";

export function verifyTemplateWorld(
  world: TemplateWorld,
  report: TemplateLifecycleReport,
) {
  const exact = isDeepStrictEqual(world.expected, report);
  return { passed: exact, checks: { exact } };
}
