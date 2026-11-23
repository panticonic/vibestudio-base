import { webSocketAuthProtocol } from "@vibestudio/rpc/protocol/webSocketAuthProtocol";
export type CdpSocketPlatform = { WebSocket?: WebSocketCtor; WebSocketPair?: unknown; fetch?: typeof fetch };
export type CdpSocketOpener = (endpoint: string, token?: string, preferFetchUpgrade?: boolean, signal?: AbortSignal) =>
  Promise<{ socket: WorkerClientWebSocket; waitForOpen: boolean }>;

export type WebSocketCtor = new (
  url: string,
  protocols?: string | string[],
) => WebSocket;

export type WorkerClientWebSocket = WebSocket & { accept?: () => void };


export async function openCdpWebSocket(
  wsEndpoint: string,
  authToken?: string,
  preferFetchUpgrade = false,
  signal?: AbortSignal,
  platform: CdpSocketPlatform = globalThis,
): Promise<{ socket: WorkerClientWebSocket; waitForOpen: boolean }> {
  const ctor = platform.WebSocket;
  if (ctor && !preferFetchUpgrade && typeof platform.WebSocketPair !== "function") {
    return {
      socket: new ctor(
        wsEndpoint,
        authToken
          ? [webSocketAuthProtocol("inspection", authToken)]
          : undefined,
      ),
      waitForOpen: true,
    };
  }

  if (typeof platform.fetch !== "function") {
    throw new Error(
      "CDP WebSocket transport is unavailable: this runtime exposes neither WebSocket nor fetch",
    );
  }

  const upgradeUrl = new URL(wsEndpoint);
  if (upgradeUrl.protocol === "ws:") upgradeUrl.protocol = "http:";
  else if (upgradeUrl.protocol === "wss:") upgradeUrl.protocol = "https:";
  else {
    throw new Error(
      `CDP endpoint must use ws: or wss:, received ${upgradeUrl.protocol}`,
    );
  }
  if (authToken) {
    const headerPairs = JSON.stringify([["x-vibestudio-cdp-grant", authToken]]);
    const encoded = btoa(headerPairs)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
    // Workerd's outbound WebSocket proxy cannot carry arbitrary upgrade
    // headers directly. This transport metadata is decoded by the egress
    // boundary, verified there, and removed before the upstream handshake.
    upgradeUrl.searchParams.set("__vibestudio_ws_headers", encoded);
  }

  const response = (await platform.fetch(upgradeUrl, {
    headers: { Upgrade: "websocket" },
    signal,
  })) as Response & { webSocket?: WorkerClientWebSocket | null };
  const socket = response.webSocket;
  if (!socket)
    throw new Error(
      `CDP WebSocket upgrade failed with HTTP ${response.status}: response contained no WebSocket`,
    );
  socket.accept?.();
  return { socket, waitForOpen: false };
}

