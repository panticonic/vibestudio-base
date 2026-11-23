import { openCdpWebSocket, type CdpSocketOpener, type CdpSocketPlatform } from "@workspace/cdp-client/socket";

/** Native runtime capability; no transport globals are endowed to guest code.
 * The caller obtains this endpoint through its own approval-gated native RPC.
 * The returned opener cannot be substituted to connect elsewhere or use a
 * different bearer grant. The host egress/bridge still validates/redeems it.
 */
export function bindNativeCdpSocket(endpoint: { wsEndpoint: string; token?: string }, preferFetchUpgrade = false): CdpSocketOpener {
  const {wsEndpoint,token}=endpoint;
  if(!token)throw new Error("Native CDP transport requires an exact inspection grant");
  const platform: CdpSocketPlatform = {
    WebSocket: globalThis.WebSocket,
    WebSocketPair: (globalThis as {WebSocketPair?:unknown}).WebSocketPair,
    fetch: typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : undefined,
  };
  return async (requested,grant,prefer,signal)=>{
    if(requested!==wsEndpoint || grant!==token)throw new Error("CDP transport is bound to its approved endpoint and grant");
    signal?.throwIfAborted();
    return openCdpWebSocket(requested,grant,preferFetchUpgrade || prefer,signal,platform);
  };
}
