import {deliveryWakeAction} from "natlang:services";
import type {DeliveryWakeAssignment, DeliveryEnvelope, DeliveryWakeEvidence, DeliveryWakeReceipt} from "./types.js";
/** Advance only the selected complete safe native range and retain the actual bounded proof. */
export default async function applyDeliveryWake(assignment: DeliveryWakeAssignment, evidence: DeliveryWakeEvidence, event: DeliveryEnvelope):Promise<DeliveryWakeReceipt>{
 return deliveryWakeAction.apply(assignment.id, event.id, evidence.pending);
}
