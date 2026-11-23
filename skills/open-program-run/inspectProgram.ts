import {programRunCatalog} from "natlang:services";
import type {RunInspection} from "./types.js";
/** Inspect actual compiler readiness, exact source revision, and callable. */
export default async function inspectProgram(programId: string):Promise<RunInspection | null>{
 return programRunCatalog.inspect(programId);
}
