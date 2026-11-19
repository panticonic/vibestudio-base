import { contextId, rpc, workers } from "@workspace/runtime";
import { channelClientRpcMethods } from "@workspace/pubsub/rpc-contract";
import { doTargetId } from "@vibestudio/shared/workspaceServiceRpc";
import {
  addAgentToChannel,
  agentObjectKey,
  removeAgentFromChannel,
} from "./index.js";
import { bindChannelMembership } from "./channelMembershipBoundary.js";
import type {
  ChannelAgentRequest,
  RosterObservation,
} from "./channel-membership/types.js";

/** Bind the selected worker inside the current caller's workspace context. */
export function createChannelMembershipServices(
  assignment: ChannelAgentRequest,
  worker: { source: string; className: string; name?: string },
  waitForReview?: Parameters<typeof addAgentToChannel>[0]["waitForReview"],
) {
  const { channelId, handle } = assignment;
  if (
    assignment.contextId !== contextId ||
    !contextId ||
    !channelId ||
    !handle
  ) {
    throw new Error(
      "Bind channel membership in the assigned workspace context.",
    );
  }
  if (channelId !== channelId.trim() || handle !== handle.trim()) {
    throw new Error("Use the canonical channel ID and handle from the caller.");
  }
  const { source, className, name } = worker;
  const key = agentObjectKey(handle, channelId);
  const targetId = doTargetId({ source, className, objectKey: key });
  const exactWorker = { source, className, handle, channelId };
  return bindChannelMembership(assignment, {
    async roster(): Promise<RosterObservation> {
      const channel = await workers.resolveService(
        "vibestudio.channel.v1",
        channelId,
      );
      if (channel.kind !== "durable-object" || !channel.targetId) {
        throw new Error(
          "The assigned channel must resolve to a Durable Object.",
        );
      }
      const channelContext = await rpc.call(
        channel.targetId,
        channelClientRpcMethods.getContextId,
        [],
      );
      if (channelContext !== contextId)
        throw new Error("The channel changed workspace context.");
      const participants = await rpc.call(
        channel.targetId,
        channelClientRpcMethods.getParticipants,
        [],
      );
      const candidates = participants.filter(
        (row) => row.metadata["handle"] === handle || matches(row),
      );
      function matches(row: (typeof participants)[number]) {
        return row.doRef
          ? row.doRef.source === source &&
              row.doRef.className === className &&
              row.doRef.objectKey === key
          : row.participantId === targetId;
      }
      if (!candidates.length) return { state: "absent", participantId: null };
      const [candidate] = candidates;
      if (
        candidates.length > 1 ||
        !candidate ||
        !matches(candidate) ||
        candidate.metadata["type"] !== "agent" ||
        candidate.metadata["handle"] !== handle
      ) {
        return { state: "conflict", participantId: null };
      }
      return { state: "member", participantId: candidate.participantId };
    },
    async add(options) {
      const result = await addAgentToChannel({
        ...exactWorker,
        contextId,
        ...(name ? { name } : {}),
        ...(waitForReview ? { waitForReview } : {}),
        replay: options.replay,
        config: {
          ...(options.modelRef ? { model: options.modelRef } : {}),
          ...(options.response === "mentioned-strict"
            ? { respondPolicy: options.response }
            : {}),
        },
      });
      if (
        result.channelId !== channelId ||
        result.contextId !== contextId ||
        result.key !== key
      ) {
        return { outcome: "uncertain", participantId: null };
      }
      return {
        outcome: result.ok ? "acknowledged" : "rejected",
        participantId: result.participantId ?? null,
      };
    },
    async remove() {
      const result = await removeAgentFromChannel(exactWorker);
      return {
        outcome: result.ok ? "acknowledged" : "rejected",
        participantId: null,
      };
    },
  });
}
