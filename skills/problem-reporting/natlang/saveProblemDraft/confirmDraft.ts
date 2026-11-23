import {problemDraftRead} from "natlang:services";
import type {LocalDraftConfirmation, LocalDraftWrite} from "../types.js";
/** Read back the assigned saved sections and their host revision. */
export default async function confirmDraft(write: LocalDraftWrite):Promise<LocalDraftConfirmation>{
 return problemDraftRead.confirm(write);
}
