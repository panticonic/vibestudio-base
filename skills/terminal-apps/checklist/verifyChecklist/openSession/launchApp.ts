import {checklistOpen} from "natlang:services";
import type {ChecklistScreen} from "../../types.js";
/** Obtain the screen of the caller's newly launched checklist. */
export default async function launchApp():Promise<ChecklistScreen>{
 return checklistOpen.launch();
}
