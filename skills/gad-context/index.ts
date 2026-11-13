/**
 * Typed reports over the `gad` inspectors, for agent eval:
 *
 *   import { inspectAgentHealth, summarizeChannel } from "@workspace-skills/gad-context";
 *   const report = await inspectAgentHealth({ channelId: chat.channelId });
 *
 * Both are exact code (SKILL.md says what each returns); no model is involved.
 */
import { gad } from "@workspace/runtime";
import { reportAgentHealth } from "./agent-health.js";
import type { ChannelRef, HealthReport } from "./types.js";

export { summarizeChannel } from "./channel-summary.js";
export type {
  ChannelRef,
  ChannelSummary,
  EnvelopeItem,
  EnvelopePage,
  Finding,
  HealthReport,
  JudgedFinding,
  Standing,
  Urgency,
} from "./types.js";

/**
 * Take one health snapshot of an agent channel and say how soon each finding needs attention. One snapshot: health is
 * not a completion signal, so do not poll.
 */
export async function inspectAgentHealth(ref: ChannelRef): Promise<HealthReport> {
  const health = await gad.inspectAgentHealth({
    channelId: ref.channelId,
    ...(ref.branchId === undefined ? {} : { branchId: ref.branchId }),
  });
  return reportAgentHealth(health);
}
