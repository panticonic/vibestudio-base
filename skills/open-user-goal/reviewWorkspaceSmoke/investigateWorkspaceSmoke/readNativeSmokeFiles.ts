import {workspaceSmokeEvidence} from "natlang:services";
import type {SmokeAssignment, SmokeSource} from "../types.js";
/** Read exact content-search hits and corresponding bytes of assigned smoke files. */
export default async function readNativeSmokeFiles(assignment: SmokeAssignment):Promise<SmokeSource>{
 return workspaceSmokeEvidence.scan(assignment.id);
}
