import type { RpcCaller, RpcCallOptions } from "@vibestudio/rpc";
import { mainRpcMethods } from "@vibestudio/service-schemas/mainRpc";
import {
  parseDoTargetId,
  type DORefParam,
} from "@vibestudio/shared/workspaceServiceRpc";

export type ChannelEndpoint = { [K in keyof DORefParam]: DORefParam[K] };
export const CHANNEL_SERVICE_PROTOCOL = "vibestudio.channel.v1";

/** Selection becomes an exact endpoint once, before membership admission. */
export async function resolveChannelEndpoint(
  rpc: Pick<RpcCaller, "call">,
  channelId: string,
  callOptions?: RpcCallOptions,
  protocol = CHANNEL_SERVICE_PROTOCOL,
  contextId?: string,
): Promise<ChannelEndpoint> {
  const service = await rpc.call(
    "main",
    mainRpcMethods["workers.resolveService"],
    contextId ? [protocol, channelId, contextId] : [protocol, channelId],
    callOptions,
  );
  const ref =
    service.kind === "durable-object" && service.targetId
      ? parseDoTargetId(service.targetId)
      : null;
  if (!ref || ref.objectKey !== channelId)
    throw new Error(
      "Channel service did not resolve the selected Durable Object",
    );
  return ref;
}
