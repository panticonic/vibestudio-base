/**
 * The conversations (channel Durable Objects) a host's workspace holds, with
 * their titles. Shared by every chat surface that offers a conversation list.
 */
import { listChannelDurableObjectEntities } from "@vibestudio/shared/channelTarget";
import { mainRpcMethods } from "@vibestudio/service-schemas/mainRpc";
import { channelClientRpcMethods } from "@workspace/pubsub/rpc-contract";
import type { ChatHostRpc } from "./ports.js";

export interface ChannelListing {
  channelId: string;
  contextId: string;
  createdAt: number;
  current: boolean;
  title: string;
}

/** Channels newest first. Title reads run four at a time; any failure is reported after all settle. */
export async function listChannelConversations(
  rpc: ChatHostRpc,
  options: { currentChannelId?: string | null; signal?: AbortSignal } = {}
): Promise<ChannelListing[]> {
  const { currentChannelId = null, signal } = options;
  const channels = await listChannelDurableObjectEntities({
    listServices: () => rpc.call("main", mainRpcMethods["workers.listServices"], [], { signal }),
    listDurableObjectEntities: async () =>
      (await rpc.call("main", mainRpcMethods["runtime.listEntities"], [{ kind: "do" }], { signal })).filter(
        (entity): entity is typeof entity & { kind: "do" } => entity.kind === "do"
      ),
  });
  const listings: ChannelListing[] = [];
  let next = 0;
  const lanes = Array.from({ length: Math.min(4, channels.length) }, async () => {
    while (next < channels.length) {
      const entity = channels[next++]!;
      const config = await rpc.call(entity.id, channelClientRpcMethods["getConfig"], [], { signal });
      listings.push({
        channelId: entity.key,
        contextId: entity.contextId,
        createdAt: entity.createdAt,
        current: entity.key === currentChannelId,
        title: config?.title || entity.key,
      });
    }
  });
  const results = await Promise.allSettled(lanes);
  const errors = results.flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
  if (errors.length) throw new AggregateError(errors, "Conversation titles could not all be read");
  return listings.sort((a, b) => b.createdAt - a.createdAt);
}
