import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
  ChildTranscriptStore,
  type ChildTranscriptConnection,
  type ChildTranscriptSnapshot,
} from "@workspace/agentic-core/chat-store";

/**
 * Lazily observe a subagent's own task channel so the parent can render the
 * child's REAL transcript — the same messages, tool pills, and argument/result
 * inspection the child's own panel would show — instead of a bounded summary.
 *
 * A mounted card shares one observer between its compact activity status and
 * expanded transcript, and releases it on unmount. React adapter over
 * `ChildTranscriptStore`.
 */

export type { ChildTranscriptConnection };

export interface ChildTranscriptResult extends ChildTranscriptSnapshot {
  loadEarlierMessages: () => Promise<void>;
  /** Start a fresh observer generation after a terminal connection failure. */
  retry: () => void;
}

const INACTIVE: ChildTranscriptSnapshot = {
  messages: [],
  participants: {},
  selfId: null,
  loading: false,
  error: null,
  hasMoreHistory: false,
  loadingMore: false,
};
const noSubscription = () => () => undefined;
const inactiveSnapshot = () => INACTIVE;
const noHistory = async () => undefined;
const noRetry = () => undefined;

export function useChildTranscript(options: {
  connection: ChildTranscriptConnection | null;
  channelId: string | null;
  contextId: string | null;
  enabled: boolean;
}): ChildTranscriptResult {
  const { connection, channelId, contextId, enabled } = options;
  const store = useMemo(
    () =>
      enabled && connection && channelId
        ? new ChildTranscriptStore({ connection, channelId, contextId })
        : null,
    [enabled, connection, channelId, contextId],
  );
  useEffect(() => store?.retain(), [store]);
  const snapshot = useSyncExternalStore(
    store?.subscribe ?? noSubscription,
    store?.getSnapshot ?? inactiveSnapshot,
    store?.getSnapshot ?? inactiveSnapshot,
  );
  return useMemo(
    () => ({
      ...snapshot,
      loadEarlierMessages: store?.loadEarlierMessages ?? noHistory,
      retry: store?.retry ?? noRetry,
    }),
    [snapshot, store],
  );
}
