import { isDeepStrictEqual } from "node:util";
import type { ConversationReport } from "../conversation-evidence-review/types.js";
import type { ConversationEvidenceWorld } from "./worlds.js";
export function verifyConversationEvidence(
  world: ConversationEvidenceWorld,
  report: ConversationReport,
) {
  const exact = isDeepStrictEqual(world.expected, report);
  return { passed: exact, checks: { exact } };
}
