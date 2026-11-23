import {workspaceShareHandoff} from "natlang:services";
import type {ShareDecision, ShareObservation, ShareReceipt} from "./types.js";
/** Stage one exact locally authorized access handoff. */
export default async function stageShare(observation: ShareObservation, decision: ShareDecision):Promise<ShareReceipt | null>{
 return workspaceShareHandoff.stage(observation, decision);
}
