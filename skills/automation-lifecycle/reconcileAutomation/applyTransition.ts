import {automationLifecycleChange} from "natlang:services";
import type {LifecycleReceipt, LifecycleRequest} from "../types.js";
/** Apply a single controller operation for the caller's assigned ID and revision. */
export default async function applyTransition(request: LifecycleRequest):Promise<LifecycleReceipt>{
 return automationLifecycleChange.apply(request.missionId, request.revisionDigest, request.action);
}
