import {deliveryWakeEvidence} from "natlang:services";
import type {DeliveryWakeAssignment} from "./types.js";
/** Read the assigned receiver, event, approved saved cursor and wake authorization. */
export default async function discoverDeliveryWake():Promise<DeliveryWakeAssignment>{
 return deliveryWakeEvidence.discover();
}
