export type LocalConversation = { id: string; title: string; maySend: boolean };
export type ConversationChoice = { roomId: string; recipientPhrase: string | null };
export type LocalRecipient = { ref: string; kind: string; note: string };
export type LocalResolution =
  | { kind: "ref"; ref: string; note: string }
  | { kind: "ambiguous"; reason: "none" | "several"; candidates: LocalRecipient[] };
export type LocalDeliveryEvidence = {
  roomId: string; channelId: string; messageId: string; senderId: string; recipientRef: string;
  content: string; sequence: number; acknowledged: boolean;
};
export type LocalObservation = {
  room: LocalConversation; basis: string; phrase: string | null; roster: LocalRecipient[];
  resolution: LocalResolution | null; prior: LocalDeliveryEvidence | null;
};
export type LocalDisposition = "delivered" | "verified" | "partial" | "held" | "unconfirmed";
export type LocalDeliveryDecision = {
  status: LocalDisposition; reason: string; evidence: { roomId: string; messageId: string }[];
  sendRoomId: string | null;
};
export type LocalAttempt = { attemptId: string; response: "submitted" | "interrupted" };
export type LocalDeliveryResult = { attempt: LocalAttempt; readback: LocalDeliveryEvidence | null };
export type LocalDeliveryReport = { status: LocalDisposition; reason: string; delivery: LocalDeliveryResult | null };
