import {androidGoalAudit} from "natlang:services";
import type {AndroidGoalAuditScope} from "./types.js";
/** Read the exact managed Android audit coordinates for this goal. */
export default async function readAndroidAuditScope(goal: string):Promise<AndroidGoalAuditScope>{
 return androidGoalAudit.readScope(goal);
}
