import {docPlanContext} from "natlang:services";
import type {PlanningState} from "./types.js";
/** Observe the current owned memo, workspace skill index, and handoff authority. */
export default async function readPlanningState():Promise<PlanningState>{
 return docPlanContext.observe();
}
