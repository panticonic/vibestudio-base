/** The composer's state, derived from the session so every renderer agrees. */
import type { ChatSessionSnapshot, PrimaryActionIntent } from "@workspace/agentic-core/chat-store";

export interface ChatComposerView {
  canSend: boolean;
  /** Why sending is unavailable; null when it is available (or there is nothing to send). */
  disabledReason: string | null;
  intent: PrimaryActionIntent;
  /** The send button's accessible name. */
  actionLabel: string;
}

const ACTION_LABELS: Record<PrimaryActionIntent, string> = {
  send: "Send",
  steer: "Steer the agent",
  queue: "Queue for after the turn",
};

export function chatComposerView(
  snapshot: Pick<ChatSessionSnapshot, "input" | "connected" | "primaryActionIntent">
): ChatComposerView {
  const hasText = snapshot.input.trim().length > 0;
  const disabledReason = snapshot.connected ? null : "Not connected. Your draft stays here.";
  return {
    canSend: hasText && snapshot.connected,
    disabledReason: hasText ? disabledReason : null,
    intent: snapshot.primaryActionIntent,
    actionLabel: ACTION_LABELS[snapshot.primaryActionIntent],
  };
}
