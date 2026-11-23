import {branchDeliveryWrite} from "natlang:services";
import type {BranchPrivateNote, BridgeDeliveryReport} from "./types.js";
/** Retain the exact authorized private decision and verified local outcome. */
export default async function retain(report: BridgeDeliveryReport):Promise<BranchPrivateNote | null>{
 return branchDeliveryWrite.retain(report);
}
