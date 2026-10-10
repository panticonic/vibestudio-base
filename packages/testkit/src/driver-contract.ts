import { createReceiverRpcMethods } from "@vibestudio/shared/rpcMethods";
import type { ProfileRef } from "./profile-core.js";

/** Structural RPC surface implemented by the workspace Testkit Driver DO. */
export interface TestkitDriverReceiver {
  cdpOpen(panelId: string): Promise<{ sessionId: string }>;
  cdpSend(
    sessionId: string,
    method: string,
    params?: Record<string, unknown>,
  ): Promise<unknown>;
  cdpSubscribe(sessionId: string, eventMethod: string): Promise<void>;
  cdpDrainEvents(
    sessionId: string,
    cursor?: number,
  ): Promise<{
    events: Array<{ seq: number; method: string; params: unknown }>;
    cursor: number;
  }>;
  cdpClose(sessionId: string): Promise<void>;
  profilePanel(
    panelId: string,
    opts?: { durationMs?: number; samplingIntervalUs?: number },
  ): Promise<ProfileRef>;
  heapSnapshot(panelId: string): Promise<ProfileRef>;
  ping(): Promise<{ ok: true; sessions: number }>;
}

export const driverRpcMethods = createReceiverRpcMethods<
  TestkitDriverReceiver
>([
  "cdpOpen",
  "cdpSend",
  "cdpSubscribe",
  "cdpDrainEvents",
  "cdpClose",
  "profilePanel",
  "heapSnapshot",
  "ping",
]);
