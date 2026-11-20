import type { LocalDeliveryDecision, LocalDeliveryReport, LocalObservation } from "../types.js";

export default function bindReport(decision: LocalDeliveryDecision, observations: LocalObservation[]): LocalDeliveryReport {
  const evidence = decision.evidence.map(({ roomId, messageId }) => {
    const receipt = observations.find(({ room }) => room.id === roomId)?.prior;
    if (!receipt || receipt.messageId !== messageId)
      throw new Error("A local delivery citation needs an observed original receipt");
    return receipt;
  });
  if (new Set(evidence.map(({ roomId }) => roomId)).size !== evidence.length)
    throw new Error("Cite each local receipt at most once");
  return { status: decision.status, reason: decision.reason, evidence, delivery: null };
}
