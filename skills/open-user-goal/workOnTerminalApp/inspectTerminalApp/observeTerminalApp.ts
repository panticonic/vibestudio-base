import {terminalRepairObserve} from "natlang:services";
import type {TerminalRepairCheck} from "../../types.js";
/** Read the installed production source and baseline native checks at this exact app's current revision. */
export default async function observeTerminalApp(appId: string):Promise<TerminalRepairCheck>{
 return terminalRepairObserve.read(appId);
}
