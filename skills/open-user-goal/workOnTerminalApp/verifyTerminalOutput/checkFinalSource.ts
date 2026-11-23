import {terminalRepairFinal} from "natlang:services";
import type {TerminalRepairCheck} from "../../types.js";
/** Independently recheck the production build and original focused native suite. */
export default async function checkFinalSource(appId: string, revision: string):Promise<TerminalRepairCheck>{
 return terminalRepairFinal.verify(appId, revision);
}
