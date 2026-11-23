import {checklistKeys} from "natlang:services";
import type {ChecklistScreen, ItemKey} from "../../types.js";
/** Send one authorized item key to the running checklist and read its updated screen. */
export default async function sendToggle(key: ItemKey):Promise<ChecklistScreen>{
 return checklistKeys.toggle(key);
}
