import {terminalCheckRun} from "natlang:services";
import type {TerminalCheckResult} from "../types.js";
/** Execute one check from the caller's observed terminal plan. */
export default async function performCheck(assignmentReceipt: string, checkId: string):Promise<TerminalCheckResult>{
 return terminalCheckRun.execute(assignmentReceipt, checkId);
}
