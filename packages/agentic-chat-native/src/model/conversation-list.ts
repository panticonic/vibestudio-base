/** Rows of the conversation list: the workspace's channels plus the open conversation's forks. */
import type { ChannelListing, ForkUiState } from "@workspace/agentic-core/chat-store";

export interface ConversationRow {
  channelId: string;
  contextId: string;
  title: string;
  kind: "conversation" | "fork" | "parent";
  current: boolean;
  /** A fork with activity since this device last read it. */
  unread: boolean;
}

export function conversationRows(input: {
  listings: readonly ChannelListing[];
  forks: Pick<ForkUiState, "children" | "siblings" | "parent"> | null;
  currentChannelId: string | null;
}): ConversationRow[] {
  const { listings, forks, currentChannelId } = input;
  const rows = new Map<string, ConversationRow>();
  const listed = new Map(listings.map((listing) => [listing.channelId, listing]));
  if (forks?.parent) {
    const { channelId, contextId } = forks.parent;
    const listing = listed.get(channelId);
    rows.set(channelId, {
      channelId,
      contextId: contextId ?? listing?.contextId ?? "",
      title: listing?.title ?? channelId,
      kind: "parent",
      current: false,
      unread: false,
    });
  }
  for (const fork of [...(forks?.children ?? []), ...(forks?.siblings ?? [])]) {
    if (fork.archived) continue;
    rows.set(fork.channelId, {
      channelId: fork.channelId,
      contextId: fork.contextId,
      title: fork.label,
      kind: "fork",
      current: fork.channelId === currentChannelId,
      unread: fork.unread === true,
    });
  }
  for (const listing of listings) {
    if (rows.has(listing.channelId)) continue;
    rows.set(listing.channelId, {
      channelId: listing.channelId,
      contextId: listing.contextId,
      title: listing.title,
      kind: "conversation",
      current: listing.channelId === currentChannelId,
      unread: false,
    });
  }
  return [...rows.values()].filter((row) => row.contextId !== "");
}
