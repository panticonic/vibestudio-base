import { createReceiverRpcMethods } from "@vibestudio/shared/rpcMethods";

export const QUICKFIRE_SERVICE_PROTOCOL = "vibestudio.quickfire.v1";

export interface QuickfireSession {
  slotId: string;
  channelId: string;
  channelTargetId: string;
  contextId: string;
  agentEntityId: string;
  state: "fresh" | "resumed" | "promoted";
  messageCount: number | null;
  lastActivityAt: number | null;
  createdAt: number;
  promotedAt: number | null;
}

export type QuickfireSessionSummary = Pick<
  QuickfireSession,
  | "slotId"
  | "channelId"
  | "channelTargetId"
  | "contextId"
  | "agentEntityId"
  | "createdAt"
  | "promotedAt"
>;

/**
 * What a client's background `ask` intent hands its handler: the declared
 * parameters, and the client principal the person's device launched it as.
 */
export interface QuickfireAskRequest {
  params: { text: string };
  principalId: string;
}

export interface QuickfireServiceClient {
  sessionFor(input: {
    slotId: string;
    fresh?: boolean;
  }): Promise<QuickfireSession>;
  clear(input: { slotId: string }): Promise<{ cleared: boolean }>;
  promote(input: { slotId: string }): Promise<QuickfireSession | null>;
  list(): Promise<QuickfireSession[]>;
  /** One question to a fresh agent, answered in full: the reply text once its turn completes. */
  ask(input: QuickfireAskRequest): Promise<string>;
}

/** Platform-neutral client ABI; the worker implements this same contract. */
export const quickfireRpcMethods =
  createReceiverRpcMethods<QuickfireServiceClient>([
    "sessionFor",
    "clear",
    "promote",
    "list",
    "ask",
  ]);
