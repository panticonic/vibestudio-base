import {checklistResume} from "natlang:services";
import type {ChecklistScreen} from "../../types.js";
/** Observe the retained checklist state after continuing the assigned terminal session. */
export default async function continueApp(kind: "reattach" | "restart"):Promise<ChecklistScreen>{
 return checklistResume.resume(kind);
}
