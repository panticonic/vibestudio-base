/**
 * What "queued" means for a chat composer's outbox, shared by every chat
 * surface so the outbox, the transcript filter and the flush control agree.
 */
import type { ChatMessage } from "../derived-types.js";

/**
 * Resolve which outbox items the user authored and are still unread.
 * - self-authored, kind === "message", not error, not retracted, zero reads.
 * Sorted by existing message order (the array is already chronological).
 */
export function deriveOutboxMessages(messages: ChatMessage[], selfId: string | null): ChatMessage[] {
  if (!selfId) return [];
  return messages.filter((m) => {
    if (m.senderId !== selfId) return false;
    if ((m.kind ?? "message") !== "message") return false;
    // Method invocations the user fired (e.g. `pause`/"send now") are projected
    // as self-authored kind:"message" rows with contentType:"invocation" and no
    // receipts — they must NOT be treated as queued chat messages. The outbox is
    // plain text/attachment messages only (those carry no special contentType).
    if (m.contentType) return false;
    if (m.error) return false;
    if (m.retracted) return false;
    // Only purely-unread messages live in the outbox. A partial/read message
    // graduates to the transcript with per-recipient badges.
    return (m.receipts?.aggregate ?? "pending") === "pending";
  });
}

/**
 * A pending recipient that has left the live roster (its receipt key is no
 * longer present) cannot integrate the message until it returns. Such a message
 * is surfaced in the TRANSCRIPT ("agent offline — delivers on return"), not the
 * outbox — so the outbox stays the set of messages actively deliverable now.
 * Derived purely from receipts + the live roster, so it self-resolves: when the
 * agent rejoins it re-enters the roster (no longer offline) and, once it folds
 * the backlog, its read-ack advances the receipt out of "pending" entirely.
 */
export function hasOfflinePendingRecipient(
  msg: ChatMessage,
  liveRoster: Record<string, unknown>
): boolean {
  const byParticipant = msg.receipts?.byParticipant;
  if (!byParticipant) return false;
  return Object.entries(byParticipant).some(
    ([key, state]) => state !== "read" && !(key in liveRoster)
  );
}

/**
 * Is there a PRESENT recipient to deliver this message to right now?
 * - With receipts: a recipient still in the roster that hasn't read it.
 * - Without receipts (optimistic, just-sent): true iff the roster has any
 *   non-self participant — i.e. someone the message is en route to. This is what
 *   lets a fresh send go STRAIGHT to the queue instead of flashing in the
 *   transcript first and then bouncing to the queue when its received-ack lands.
 * A message with no recipient at all (sent before any agent joined) returns
 * false, so it stays in the transcript rather than vanishing into the outbox.
 */
function hasDeliverableRecipient(
  msg: ChatMessage,
  selfId: string,
  liveRoster: Record<string, unknown>
): boolean {
  const byParticipant = msg.receipts?.byParticipant;
  if (byParticipant) {
    return Object.entries(byParticipant).some(
      ([key, state]) => state !== "read" && key in liveRoster
    );
  }
  return Object.keys(liveRoster).some((key) => key !== selfId);
}

/**
 * The outbox / transcript-hidden set: pending self messages still actively
 * deliverable to a PRESENT recipient. Excludes offline-recipient ones AND
 * no-recipient ones (both shown in the transcript instead). Shared by the
 * Outbox, the transcript filter, and the composer's flush control so all three
 * agree on what "queued" means — and so a message lives in exactly ONE place
 * (queue OR transcript) and transitions once (queue → transcript on read),
 * never flickering between them.
 */
export function deriveActiveOutbox(
  messages: ChatMessage[],
  selfId: string | null,
  liveRoster: Record<string, unknown>
): ChatMessage[] {
  if (!selfId) return [];
  return deriveOutboxMessages(messages, selfId).filter(
    (m) =>
      !hasOfflinePendingRecipient(m, liveRoster) && hasDeliverableRecipient(m, selfId, liveRoster)
  );
}
