import {localMethodRead} from "natlang:services";
import type {LocalMethodReport} from "../types.js";
/** Reread the canonical invocation terminal and provider receipt by the exact transport. */
export default async function readExactMethodTerminal(id: string, basis: string, transport: string | null):Promise<LocalMethodReport | null>{
 return localMethodRead.settle(id, basis, transport);
}
