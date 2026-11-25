import {terminalRepairApply} from "natlang:services";
import type {TerminalRepairApplied,TerminalRepairEdit} from "../types.js";
/** Native CAS boundary; no semantic routing or inferred authority. */
export default function applyReviewedTerminalEdit(appId:string,revision:string,edits:TerminalRepairEdit[]):Promise<TerminalRepairApplied>{
 return terminalRepairApply.edit(appId,revision,edits);
}
