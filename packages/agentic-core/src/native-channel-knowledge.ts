import {
  resolveChannelEndpoint,
  type ChannelEndpoint,
} from "@workspace/pubsub";
import { agentRpcMethods } from "./rpc-contract.js";
import type { JsonValue } from "@panticonic/pi-chord";
import type { ConversationHistory, EntryId } from "@panticonic/pi-durable";
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

/** An immutable knowledge prefix, containing no source execution or authority. */
export interface NativeChannelKnowledge {
  readonly channelId: string;
  readonly throughSequence: number;
  readonly history: ConversationHistory;
  readonly anchors: readonly NativeChannelKnowledgeAnchor[];
  /** Immutable user/domain configuration; never tasks, receipts, or execution state. */
  readonly configuration?: JsonValue;
}

export interface ExportChannelKnowledgeInput {
  readonly operationId: string;
  readonly channelId: string;
  readonly throughSequence: number;
}

export interface ImportChannelKnowledgeInput {
  readonly operationId: string;
  readonly parentChannelId: string;
  readonly channelId: string;
  readonly channelRef: ChannelEndpoint;
  readonly contextId: string;
  readonly knowledge: NativeChannelKnowledge;
  readonly config?: AgentSubscriptionConfig | Record<string, unknown>;
}

export async function importAgentChannelKnowledge(
  rpc: AgentLaunchRpc,
  handleOrTargetId: AgentEntityHandle | string,
  input: Omit<ImportChannelKnowledgeInput, "channelRef">,
): Promise<AgentSubscriptionResult> {
  const channelRef = await resolveChannelEndpoint(rpc, input.channelId);
  return requireAgentSubscriptionResult(
    "importChannelKnowledge",
    await rpc.call(
      targetIdFor(handleOrTargetId),
      agentRpcMethods["importChannelKnowledge"],
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
