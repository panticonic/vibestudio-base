import {automationPlanning} from "natlang:services";
import type {AutomationPlanningSnapshot} from "../types.js";
/** Observe the current live state and bounded run history for one assigned automation roster. */
export default async function observePlanningState(operationId: string):Promise<AutomationPlanningSnapshot>{
 return automationPlanning.inspect(operationId);
}
