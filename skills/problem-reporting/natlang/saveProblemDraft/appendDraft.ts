import {problemDraftAppend} from "natlang:services";
import type {LocalDraft, LocalDraftSection, LocalDraftWrite} from "../types.js";
/** Append the authored sections at the exact draft revision. */
export default async function appendDraft(draft: LocalDraft, sections: LocalDraftSection[]):Promise<LocalDraftWrite>{
 return problemDraftAppend.append(draft, sections);
}
