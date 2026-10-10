import { createReceiverRpcMethods } from "@vibestudio/shared/rpcMethods";
import type { AgentSubscriptionResult } from "./agent-launch.js";
import type { ImportChannelKnowledgeInput } from "./native-channel-knowledge.js";

/** The agent RPC methods used by agentic-core's launch and knowledge clients. */
export interface AgentRpcClientMethods {
  subscribeChannel(input: {
    channelId: string;
    channelRef: import("@vibestudio/shared/workspaceServiceRpc").DORefParam;
    contextId: string;
    config?: unknown;
    replay?: boolean;
    delivery?: "all" | "addressed";
  }): Promise<AgentSubscriptionResult>;
  unsubscribeChannel(channelId: string): Promise<{ ok: boolean }>;
  importChannelKnowledge(
    input: ImportChannelKnowledgeInput,
  ): Promise<AgentSubscriptionResult>;
}

export const agentRpcMethods = createReceiverRpcMethods<AgentRpcClientMethods>([
  "subscribeChannel",
  "unsubscribeChannel",
  "importChannelKnowledge",
]);
