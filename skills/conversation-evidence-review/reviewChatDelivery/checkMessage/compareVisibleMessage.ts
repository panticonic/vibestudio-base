import type {
  ChatDeliveryMessage,
  ChatDeliveryMessageVerdict,
  DurableDeliveryRow,
} from "../../types.js";

export default function compareVisibleMessage(
  retained: DurableDeliveryRow,
  messages: ChatDeliveryMessage[],
): ChatDeliveryMessageVerdict {
  const matching = messages.filter(
    ({ messageId }) => messageId === retained.messageId,
  );
  if (matching.length === 0) return "message-missing";
  if (matching.length > 1) return "message-repeated";
  return matching[0]!.text === retained.text ? "verified" : "message-divergent";
}
