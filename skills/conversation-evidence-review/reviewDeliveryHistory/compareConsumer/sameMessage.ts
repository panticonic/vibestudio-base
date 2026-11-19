import type { DeliveryMessage } from "../../types.js";

export default function sameMessage(original: DeliveryMessage, rendered: DeliveryMessage): boolean {
  return original.messageId === rendered.messageId &&
    original.senderId === rendered.senderId && original.text === rendered.text;
}
