import { isDeepStrictEqual } from "node:util";
import type { ApprovalVisibilityWorld } from "./worlds.js";
import type { approvalTransitionWorlds } from "./transition-worlds.js";

export function verifyApprovalVisibility(
  world: ApprovalVisibilityWorld | (typeof approvalTransitionWorlds)[number],
  value: unknown,
) {
  const exactlyObserved = isDeepStrictEqual(world.expected, value);
  return { passed: exactlyObserved, checks: { exactlyObserved } };
}
