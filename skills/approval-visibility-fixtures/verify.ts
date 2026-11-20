import { isDeepStrictEqual } from "node:util";
import type { ApprovalVisibilityWorld } from "./worlds.js";

export function verifyApprovalVisibility(
  world: ApprovalVisibilityWorld,
  value: unknown,
) {
  const exactlyObserved = isDeepStrictEqual(world.expected, value);
  return { passed: exactlyObserved, checks: { exactlyObserved } };
}
