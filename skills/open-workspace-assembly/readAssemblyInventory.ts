import {assemblyInventory} from "natlang:services";
import type {AssemblyInventory} from "./types.js";
/** Read the current owned package candidates, reviewed and current states, and authorized scope. */
export default async function readAssemblyInventory():Promise<AssemblyInventory>{
 return assemblyInventory.observe();
}
