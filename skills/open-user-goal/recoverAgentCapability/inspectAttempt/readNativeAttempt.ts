import {agentCapabilityEvidence} from "natlang:services";
import type {ActionEvidence} from "../types.js";
/** Read the exact retained admitted action, event window and current scoped values. */
export default async function readNativeAttempt(id: string):Promise<ActionEvidence>{
 return agentCapabilityEvidence.inspect(id);
}
