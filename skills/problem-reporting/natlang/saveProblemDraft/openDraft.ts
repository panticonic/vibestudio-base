import {problemDraftOpen} from "natlang:services";
import type {LocalDraft} from "../types.js";
/** Create one assigned manual draft with the original account. */
export default async function openDraft(operationId: string):Promise<LocalDraft>{
 return problemDraftOpen.create(operationId);
}
