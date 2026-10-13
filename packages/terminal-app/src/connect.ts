/**
 * Connect a terminal app to its workspace as its own runtime principal, over
 * the gateway's WebSocket RPC (the same admission and session protocol every
 * client uses). The connection grant was minted for this principal by the
 * launch service on behalf of the person who started the app; the transport
 * re-presents it to recover after a dropped connection.
 */
import { createRpcClient, type RpcClient } from "@vibestudio/rpc";
import { wsClientTransport } from "@vibestudio/rpc/transports/wsClient";
import { NodeWsLike } from "@vibestudio/rpc/transports/nodeWsLike";
import { serverRpcWsUrl } from "@vibestudio/shared/connect";
import WebSocket from "ws";
import type { TerminalAppLaunch } from "./launch.js";

export interface TerminalAppConnection {
  rpc: RpcClient;
  /** Close the connection (the program is ending). */
  close(): Promise<void>;
}

export async function connectTerminalApp(
  launch: TerminalAppLaunch,
  options: { clientLabel?: string } = {}
): Promise<TerminalAppConnection> {
  const lifetime = new AbortController();
  const recoveryHandlers = new Set<(kind: "resubscribe" | "cold-recover") => void>();
  const transport = wsClientTransport({
    selfId: launch.principalId,
    // The launch service leased exactly this connection for the program.
    connectionId: launch.connectionId,
    getWsUrl: () => serverRpcWsUrl(launch.gatewayUrl),
    reconnect: true,
    logPrefix: "[terminal-app]",
    getAuthMessageFields: () => ({
      clientLabel: options.clientLabel ?? "Vibestudio terminal app",
      clientPlatform: "headless",
    }),
    onRecovery: (kind) => {
      for (const handler of [...recoveryHandlers]) handler(kind);
    },
    adapter: {
      now: () => Date.now(),
      getAuthToken: async () => launch.grant,
      createSocket: (url, protocols) => new NodeWsLike(new WebSocket(url, protocols)),
    },
  });
  const rpc = createRpcClient({
    selfId: launch.principalId,
    callerKind: "panel",
    transport,
    lifetime: lifetime.signal,
    onRecovery: (handler) => {
      recoveryHandlers.add(handler);
      return () => recoveryHandlers.delete(handler);
    },
  });
  await transport.connectAndWait(null);
  return {
    rpc,
    async close() {
      lifetime.abort();
      await transport.close();
    },
  };
}
