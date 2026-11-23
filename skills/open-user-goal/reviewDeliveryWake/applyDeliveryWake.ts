import {deliveryWakeAction} from "natlang:services";
import type {DeliveryWakeAssignment, DeliveryWakeChoice, DeliveryWakeEvidence, DeliveryWakeReceipt} from "./types.js";
/** Advance only the selected complete safe native range and retain the actual bounded proof. */
export default async function applyDeliveryWake(assignment: DeliveryWakeAssignment, evidence: DeliveryWakeEvidence, choice: DeliveryWakeChoice):Promise<DeliveryWakeReceipt>{
 return deliveryWakeAction.apply(assignment.id, choice.event.id, evidence.pending);
}
