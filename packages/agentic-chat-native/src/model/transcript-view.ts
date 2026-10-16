/**
 * What the native transcript draws, derived from a `ChatSession` snapshot.
 *
 * The conversation is projected by the same quickfire projection the mobile
 * sheet uses (`projectTranscript` -> `transcriptCards`), which already decides
 * markdown, tool records, attachments and notices once. This module adds the
 * one thing a full chat has that a compact sheet does not: the inline-UI cards
 * an agent rendered, which the projection announces as `rich` entries and which
 * a surface may run (`renderPanelCard`).
 */
import type { ChatMessage } from "@workspace/agentic-core";
import { chatMessagesFromChannelView } from "@workspace/agentic-core/channel-chat-merge";
import type { ChatSessionSnapshot } from "@workspace/agentic-core/chat-store";
import { transcriptCards, type QuickfireCard } from "@workspace/quickfire-core";
import { projectTranscript } from "@workspace/quickfire-core/transcript";

export interface ChatTranscriptView {
  cards: QuickfireCard[];
  /** The durable message behind each `rich` card, by card id. */
  richMessages: ReadonlyMap<string, ChatMessage>;
  hasMoreHistory: boolean;
  loadingMore: boolean;
}

export interface ChatTranscriptViewOptions {
  /** Epoch ms "now" for relative times; passed in so the derivation stays pure. */
  now: number;
}

type TranscriptSource = Pick<
  ChatSessionSnapshot,
  "view" | "selfId" | "pendingSendCount" | "hasMoreHistory" | "loadingMore"
>;

/** Every entry the session holds: scrolling, not truncation, bounds a phone transcript. */
const WHOLE_TRANSCRIPT = Number.MAX_SAFE_INTEGER;

export function chatTranscriptView(
  source: TranscriptSource,
  options: ChatTranscriptViewOptions
): ChatTranscriptView {
  const { entries } = projectTranscript(source.view, source.selfId, {
    limit: WHOLE_TRANSCRIPT,
    imageDelivery: "inline",
    awaitingResponse: source.pendingSendCount > 0,
  });
  const richIds = new Set(entries.filter((entry) => entry.kind === "rich").map((entry) => entry.id));
  const richMessages = new Map<string, ChatMessage>();
  if (richIds.size > 0) {
    for (const message of chatMessagesFromChannelView(source.view)) {
      if (richIds.has(message.id)) richMessages.set(message.id, message);
    }
  }
  return {
    cards: transcriptCards(entries, { now: options.now }),
    richMessages,
    hasMoreHistory: source.hasMoreHistory,
    loadingMore: source.loadingMore,
  };
}
