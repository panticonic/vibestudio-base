import {problemDraftRead} from "natlang:services";
import type {LocalProblemObservation} from "../types.js";
/** Observe the assigned local report and owner's account. */
export default async function readDraft(operationId: string):Promise<LocalProblemObservation>{
 return problemDraftRead.observe(operationId);
}
