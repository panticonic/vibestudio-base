import {openTerminalHandoff} from "natlang:services";
import type {TerminalHandoff} from "./types.js";
/** Commit the currently observed receipts to a local scratch file when the caller authorized it. */
export default async function stageTerminalHandoff():Promise<TerminalHandoff | null>{
 return openTerminalHandoff.stage();
}
