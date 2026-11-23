import {openTerminalLifecycle} from "natlang:services";
import type {TerminalEvent, TerminalTransition} from "./types.js";
/** Perform one selected terminal lifecycle transition and read the native result. */
export default async function advanceTerminal(request: TerminalTransition):Promise<TerminalEvent | null>{
 return openTerminalLifecycle.advance(request);
}
