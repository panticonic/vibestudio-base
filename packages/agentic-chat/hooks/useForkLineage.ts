/** Durable fork-lineage state and actions for the agentic chat surface. */
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import {
  ForkLineageStore,
  type ForkLineageRpc,
  type ForkNavHandlers,
  type ForkUiState,
} from "@workspace/agentic-core/chat-store";
import type { ChatMessage } from "@workspace/agentic-core";
import type { PubSubClient } from "@workspace/pubsub";
import type { ChatParticipantMetadata } from "../types";

export interface UseForkLineageOptions {
  rpc: ForkLineageRpc;
  channelId: string | null;
  contextId?: string;
  selfId: string | null;
  selfMetadata?: { name?: string; type?: string; handle?: string };
  /** Accepted for call-site compatibility; lineage never reads the transcript. */
  messages: ChatMessage[];
  replaySettled: boolean;
  /** Changes when a workspace review may have unblocked cursor persistence. */
  retrySignal?: number;
  /** Connection readiness only; lineage has its own response-owned stream. */
  client?: Pick<
    PubSubClient<ChatParticipantMetadata>,
    "connected" | "onDisconnect" | "onReady"
  > | null;
  nav?: ForkNavHandlers;
}

/** React adapter over `ForkLineageStore`. */
export function useForkLineage(options: UseForkLineageOptions): ForkUiState {
  const { rpc, channelId, contextId, selfId, replaySettled, retrySignal, client, nav } = options;
  // A store belongs to one channel in one context. Its RPC transport is read
  // when it is created (like a session's connection config), so a caller that
  // rebuilds an equivalent transport each render does not replace the store.
  const rpcAtCreation = useRef(rpc);
  rpcAtCreation.current = rpc;
  const store = useMemo(
    () =>
      new ForkLineageStore({
        rpc: rpcAtCreation.current,
        channelId,
        ...(contextId !== undefined ? { contextId } : {}),
      }),
    [channelId, contextId]
  );
  useEffect(() => store.retain(), [store]);
  useEffect(() => {
    store.setInputs({
      client: client ?? null,
      selfId,
      replaySettled,
      ...(retrySignal !== undefined ? { retrySignal } : {}),
      ...(nav ? { nav } : {}),
    });
  }, [store, client, selfId, replaySettled, retrySignal, nav]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
