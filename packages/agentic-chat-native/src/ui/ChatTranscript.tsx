/**
 * The conversation transcript, drawn through the quickfire skin so it is the
 * same component tree the desktop overlay and the mobile sheet render:
 * markdown, tool records, attachments, notices and approvals all come from the
 * shared cards. What this adds is the agent's inline UI: a card that is a
 * panel is handed to the injected `renderPanelCard` (the client kit supplies a
 * WebView card); without one the shared "not runnable here" card stands.
 */
import type { ReactNode } from "react";
import type { ChatMessage } from "@workspace/agentic-core";
import type { QuickfireCard, QuickfireCardActionId } from "@workspace/quickfire-core";
import { Transcript, useSkin } from "@workspace/quickfire-core/ui";
import type { ChatTranscriptView } from "../model/transcript-view.js";

export interface PanelCardRequest {
  /** Transcript card id (the message id). */
  cardId: string;
  /** The inline-UI or custom message the card renders. */
  message: ChatMessage;
}

export type RenderPanelCard = (request: PanelCardRequest) => ReactNode;

export interface ChatTranscriptProps {
  view: ChatTranscriptView;
  renderPanelCard?: RenderPanelCard;
  onAction?: (action: QuickfireCardActionId, card: QuickfireCard, value?: string) => void;
  onLoadEarlier?: () => void;
}

export function ChatTranscript({
  view,
  renderPanelCard,
  onAction,
  onLoadEarlier,
}: ChatTranscriptProps) {
  const { Box, Text, Pressable, Spinner } = useSkin();
  const header = view.hasMoreHistory ? (
    view.loadingMore ? (
      <Spinner />
    ) : (
      <Pressable label="Load earlier messages" onPress={() => onLoadEarlier?.()} disabled={!onLoadEarlier}>
        <Text variant="caption" tone="accent">
          Load earlier messages
        </Text>
      </Pressable>
    )
  ) : undefined;
  return (
    <Transcript
      cards={view.cards}
      header={header}
      {...(onAction ? { onAction } : {})}
      renderCard={(card) => {
        if (card.kind !== "rich" || !renderPanelCard) return undefined;
        const message = view.richMessages.get(card.id);
        if (!message) return undefined;
        return (
          <Box surface="outline" full testId={`chat-panel-card-${card.id}`}>
            {renderPanelCard({ cardId: card.id, message })}
          </Box>
        );
      }}
    />
  );
}
