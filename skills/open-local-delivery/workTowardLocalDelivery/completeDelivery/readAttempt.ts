import { localDeliveryReadback } from "natlang:services";
import type { LocalDeliveryEvidence } from "../../types.js";

export default async function readAttempt(attemptId: string): Promise<LocalDeliveryEvidence | null> {
  return localDeliveryReadback.read(attemptId);
}
