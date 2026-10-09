import type {
  ConversationId,
  SubmissionId,
} from "@panticonic/pi-durable";
import type { TurnId } from "@workspace/agentic-protocol";

/** A native run is identified on the channel by its conversation and first admitted input. */
export function nativeTurnId(
  conversationId: ConversationId,
  input: SubmissionId,
): TurnId {
  return `native-run:${conversationId}:${input}` as TurnId;
}

/** The first admitted input of a native run of this conversation, or null for any other turn. */
export function nativeTurnInput(
  conversationId: ConversationId,
  turnId: string | undefined,
): SubmissionId | null {
  const prefix = `native-run:${conversationId}:`;
  if (!turnId?.startsWith(prefix)) return null;
  const input = turnId.slice(prefix.length);
  if (!/^[1-9]\d*$/.test(input)) return null;
  const id = Number(input);
  return Number.isSafeInteger(id) ? (id as SubmissionId) : null;
}
