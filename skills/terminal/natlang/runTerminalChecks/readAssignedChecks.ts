import {terminalCheckRead} from "natlang:services";
import type {TerminalPlan} from "../types.js";
/** Read the caller's exact set of bounded process checks and their dependencies. */
export default async function readAssignedChecks(operationId: string):Promise<TerminalPlan>{
 return terminalCheckRead.observe(operationId);
}
