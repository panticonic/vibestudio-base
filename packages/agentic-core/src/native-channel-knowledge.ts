import {
  resolveChannelEndpoint,
  type ChannelEndpoint,
} from "@workspace/pubsub";
import { agentRpcMethods } from "./rpc-contract.js";
import type { JsonValue } from "@panticonic/pi-chord";
import type { EntryId } from "@panticonic/pi-durable";
import {
  requireAgentSubscriptionResult,
  targetIdFor,
  type AgentEntityHandle,
  type AgentLaunchRpc,
  type AgentSubscriptionResult,
} from "./agent-launch.js";
import {
  toSubscriptionConfig,
  type AgentSubscriptionConfig,
} from "./agent-subscription-config.js";

/** Transcript provenance only. Receiving IDs are allocated by native import. */
export interface NativeChannelKnowledgeAnchor {
  readonly envelopeId: string;
  readonly sequence: number;
  readonly eventDigest: string;
  readonly entryId: EntryId;
}

/**
 * What an agent's cell was when a fork of it was taken: the cell is forked at `commit`, the last closed turn that holds
 * no entry beyond what the channel prefix accounts for, so the receiving agent has the entries through `entryHigh`
 * under the same IDs. It adopts them with the anchors and configuration here, and holds no execution or authority.
 */
export interface NativeForkFrontier {
  readonly channelId: string;
  readonly throughSequence: number;
  /** The native conversation of the source's channel; the fork holds it under this ID. */
  readonly conversationId: number;
  /** The commit of the source's cell the fork is taken at. */
  readonly commit: string;
  /** The greatest entry that commit holds. */
  readonly entryHigh: number;
  readonly anchors: readonly NativeChannelKnowledgeAnchor[];
  /** Immutable user/domain configuration; never tasks, receipts, or execution state. */
  readonly configuration?: JsonValue;
}

export interface ExportChannelKnowledgeInput {
  readonly operationId: string;
  readonly channelId: string;
  readonly throughSequence: number;
}

export interface AdoptChannelKnowledgeInput {
  readonly operationId: string;
  readonly parentChannelId: string;
  readonly channelId: string;
  readonly channelRef: ChannelEndpoint;
  readonly contextId: string;
  readonly frontier: NativeForkFrontier;
  readonly config?: AgentSubscriptionConfig | Record<string, unknown>;
}

export async function adoptAgentChannelKnowledge(
  rpc: AgentLaunchRpc,
  handleOrTargetId: AgentEntityHandle | string,
  input: Omit<AdoptChannelKnowledgeInput, "channelRef">,
): Promise<AgentSubscriptionResult> {
  const channelRef = await resolveChannelEndpoint(
    rpc,
    input.channelId,
    undefined,
    undefined,
    input.contextId,
  );
  return requireAgentSubscriptionResult(
    "adoptChannelKnowledge",
    await rpc.call(
      targetIdFor(handleOrTargetId),
      agentRpcMethods["adoptChannelKnowledge"],
      [
        {
          ...input,
          channelRef,
          config: toSubscriptionConfig(input.config),
        },
      ],
    ),
  );
}
