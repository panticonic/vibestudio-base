import { channelClientRpcMethods } from "@workspace/pubsub/rpc-contract";
import { readChannelSubscriptionRecords } from "@vibestudio/service-schemas/channel";
import type {
  RpcClient,
  RpcCallOptions,
  RpcStreamOptions,
} from "@vibestudio/rpc";

/** The small, portable conversation surface used by connected applications.
 * It deliberately delegates to the workspace's existing channel service: the
 * channel log remains the conversation store and the channel stream remains
 * the model/agent delivery path. */
export interface ConversationClient {
  history(channelTargetId: string, options?: RpcCallOptions): Promise<unknown>;
  send(
    channelTargetId: string,
    text: string,
    options?: Record<string, unknown>,
  ): Promise<unknown>;
  subscribe(
    channelTargetId: string,
    participantId: string,
    metadata: Record<string, unknown>,
    onRecord: (record: unknown) => void | Promise<void>,
    options?: RpcStreamOptions,
  ): Promise<void>;
}

export function createConversationClient(rpc: RpcClient): ConversationClient {
  return {
    history: (channelTargetId, options) => {
      return rpc.call(
        channelTargetId,
        channelClientRpcMethods["getReplayAfter"],
        [{ after: 0 }],
        options,
      );
    },
    send: (channelTargetId, text, options) => {
      return rpc.call(channelTargetId, channelClientRpcMethods["sendAsCaller"], [text, options ?? {}]);
    },
    subscribe: async (
      channelTargetId,
      participantId,
      metadata,
      onRecord,
      options,
    ) => {
      const response = await rpc.stream(
        channelTargetId,
        channelClientRpcMethods["subscribe"],
        [participantId, metadata],
        options,
      );
      for await (const record of readChannelSubscriptionRecords(response)) {
        await onRecord(record);
      }
    },
  };
}
