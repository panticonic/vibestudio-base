import {branchDeliveryWrite} from "natlang:services";
import type {DeliveryState, LocalDeliveryReceipt} from "./types.js";
/** Commit the verified exact local draft when its working basis still matches. */
export default async function commit(id: string, basis: DeliveryState):Promise<LocalDeliveryReceipt | null>{
 return branchDeliveryWrite.commit(id, basis);
}
