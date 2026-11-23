import {programRunCatalog} from "natlang:services";
import type {RunProgram} from "./types.js";
/** Discover owned workspace programs and permitted sample purposes. */
export default async function discoverRuns():Promise<RunProgram[]>{
 return programRunCatalog.list();
}
