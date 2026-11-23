import { openCdpWebSocket as openSocket, type CdpSocketOpener } from "@vibestudio/rpc/protocol/cdpSocket";
export type { CdpSocketOpener, CdpSocketPlatform, WorkerClientWebSocket, WebSocketCtor } from "@vibestudio/rpc/protocol/cdpSocket";

// The default platform belongs to this caller's realm. The shared SDK never
// supplies its own ambient transport to an imported guest.
export const openCdpWebSocket: CdpSocketOpener = (url,token,prefer,signal) =>
  openSocket(url,token,prefer,signal,globalThis);
