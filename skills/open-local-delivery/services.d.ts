declare module "natlang:services" {
  export const localDeliveryCatalog: { discover(): Promise<import("./types.js").LocalConversation[]> };
  export const localDeliveryHistory: { inspect(roomId: string, recipientPhrase: string | null): Promise<import("./types.js").LocalObservation> };
  export const localDeliverySend: { submit(basis: string, content: string): Promise<import("./types.js").LocalAttempt> };
  export const localDeliveryReadback: { read(attemptId: string): Promise<import("./types.js").LocalDeliveryEvidence | null> };
}
