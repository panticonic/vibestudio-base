import { isDeepStrictEqual } from "node:util";
import type { AutomationReport } from "../automations/types.js";
import type { AutomationWorld } from "./worlds.js";

export function verifyAutomationWorld(
  world: AutomationWorld,
  report: AutomationReport,
) {
  const expected = world.expected;
  const exact =
    expected.kind === "hold"
      ? report.kind === "hold" && expected.reason.test(report.reason)
      : isDeepStrictEqual(report, expected);
  return { passed: exact, checks: { exact } };
}
