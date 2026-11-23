import {deliveryWakeEvidence} from "natlang:services";
import type {DeliveryWakeAssignment, DeliveryWakeEvidence} from "../types.js";
/** Read scoped native evidence following the bounded reconnect attempt. */
export default async function readNativeWake(assignment: DeliveryWakeAssignment):Promise<DeliveryWakeEvidence>{
 return deliveryWakeEvidence.observe(assignment.id);
}
