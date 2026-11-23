import {workspaceSmokeHandoff} from "natlang:services";
import type {SmokeAssignment, SmokeDecision, SmokeReceipt, SmokeRuntime, SmokeSelection} from "./types.js";
/** Retain the exact authorized successful smoke receipt locally. */
export default async function stageWorkspaceSmoke(assignment: SmokeAssignment, selection: SmokeSelection, runtime: SmokeRuntime, decision: SmokeDecision):Promise<SmokeReceipt>{
 return workspaceSmokeHandoff.stage(assignment.id, selection.plan.path, runtime.runDigest);
}
