import {programExecution} from "natlang:services";
import type {StartedRun} from "./types.js";
/** Run one observed program revision on the caller-authorized sample. */
export default async function runSample(programId: string, revision: string, sampleId: string):Promise<StartedRun | null>{
 return programExecution.run(programId, revision, sampleId);
}
