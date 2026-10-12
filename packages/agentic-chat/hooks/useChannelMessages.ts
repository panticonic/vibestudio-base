/**
 * useChannelMessages — React view of a raw channel client's transcript.
 *
 * A thin binding over `ChannelViewFeed.follow(client)`; the reduction, replay
 * batching, delta coalescing and paging live in the feed. Each client change
 * starts a new feed generation (the previous one is cancelled and released).
 */

import { useCallback, useEffect, useMemo } from "react";
import type { ParticipantMetadata, PubSubClient } from "@workspace/pubsub";
import { ChannelViewFeed, type ChannelViewFeedSnapshot } from "@workspace/agentic-core/chat-store";
import { useStoreSnapshot } from "./useChatStore";

export interface UseChannelMessagesResult
  extends Pick<
    ChannelViewFeedSnapshot,
    | "messages"
    | "actionBar"
    | "messageTypes"
    | "hasMoreHistory"
    | "loadingMore"
    | "hasOpenTurn"
    | "replaySettled"
  > {
  loadEarlierMessages: () => Promise<void>;
  backfillAfterLocalPublish: (pubsubId: number | undefined) => Promise<void>;
}

export function useChannelMessages<T extends ParticipantMetadata = ParticipantMetadata>(
  client: PubSubClient<T> | null
): UseChannelMessagesResult {
  const feed = useMemo(() => new ChannelViewFeed(), []);
  useEffect(() => {
    if (!client) {
      feed.reset();
      return;
    }
    return feed.follow(client as unknown as PubSubClient);
  }, [feed, client]);
  const snapshot = useStoreSnapshot(feed);
  const loadEarlierMessages = useCallback(() => feed.loadEarlierMessages(), [feed]);
  const backfillAfterLocalPublish = useCallback(
    (pubsubId: number | undefined) => feed.backfillAfterLocalPublish(pubsubId),
    [feed]
  );
  return {
    messages: snapshot.messages,
    actionBar: snapshot.actionBar,
    messageTypes: snapshot.messageTypes,
    hasMoreHistory: snapshot.hasMoreHistory,
    loadingMore: snapshot.loadingMore,
    hasOpenTurn: snapshot.hasOpenTurn,
    replaySettled: snapshot.replaySettled,
    loadEarlierMessages,
    backfillAfterLocalPublish,
  };
}
