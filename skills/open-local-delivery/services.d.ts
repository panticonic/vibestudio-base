import type { LocalAttempt, LocalConversation, LocalDeliveryEvidence, LocalObservation } from "./types.js";

declare module "natlang:services" {
  export const localDeliveryCatalog: { discover(): Promise<LocalConversation[]> };
  export const localDeliveryHistory: { inspect(roomId: string, recipientPhrase: string | null): Promise<LocalObservation> };
  export const localDeliverySend: { submit(basis: string, content: string): Promise<LocalAttempt> };
  export const localDeliveryReadback: { read(attemptId: string): Promise<LocalDeliveryEvidence | null> };
}
