/** Runtime-neutral launch and persistence of a chat host's installed agents. */
import { launchAgentIntoChannel, type AgentLaunchRpc } from "../../agent-launch.js";
import {
  withWorkspaceReviewRetry,
  type WorkspaceReviewWaiter,
} from "../../provisional-agent-lifecycle.js";
import { appendInstalledAgent, type InstalledAgentRecord } from "./installed-agents.js";
import type { StateArgsPort } from "./ports.js";

/** Create or reactivate an agent entity, then subscribe it to the channel. */
export async function createAndSubscribeAgent(
  rpc: AgentLaunchRpc,
  waitForReview: WorkspaceReviewWaiter | undefined,
  args: {
    source: string;
    className: string;
    key: string;
    channelId: string;
    channelContextId: string;
    config?: Record<string, unknown>;
    replay?: boolean;
  }
): Promise<{ ok: boolean; participantId?: string }> {
  if (!args.channelContextId) {
    throw new Error("Cannot subscribe an agent DO without a context ID");
  }
  const { subscription } = await withWorkspaceReviewRetry(
    () =>
      launchAgentIntoChannel(rpc, {
        source: args.source,
        className: args.className,
        key: args.key,
        channelId: args.channelId,
        contextId: args.channelContextId,
        config: args.config,
        replay: args.replay,
      }),
    waitForReview
  );
  return subscription;
}

/** Retain the claimed agent identity while review blocks its durable record.
 * Retry only the idempotent persistence, never the already-completed launch,
 * and re-read the latest state on every attempt so concurrent additions survive. */
export async function persistInstalledAgent(
  state: StateArgsPort,
  waitForReview: WorkspaceReviewWaiter | undefined,
  agent: InstalledAgentRecord
): Promise<void> {
  await withWorkspaceReviewRetry(async () => {
    const current = state.get();
    await state.patch({
      installedAgents: appendInstalledAgent(current.installedAgents, agent),
    });
  }, waitForReview);
}
