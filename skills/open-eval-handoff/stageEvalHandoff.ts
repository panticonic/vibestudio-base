import {openEvalHandoff} from "natlang:services";
import type {EvalHandoffArtifact} from "./types.js";
/** Stage an authorized scratch handoff from a native confirmed result. */
export default async function stageEvalHandoff(jobId: string, runId: string):Promise<EvalHandoffArtifact | null>{
 return openEvalHandoff.stage(jobId, runId);
}
