import {workspaceSmokeHandoff} from "natlang:services";
import type {SmokeAssignment, SmokeReceipt, SmokeRuntime, SmokeSelection} from "./types.js";
/** Retain the exact authorized successful smoke receipt locally. */
export default async function stageWorkspaceSmoke(assignment: SmokeAssignment, selection: SmokeSelection, runtime: SmokeRuntime):Promise<SmokeReceipt>{
 if(!selection.plan)throw new Error("Smoke retention requires the exact selected plan");
 return workspaceSmokeHandoff.stage(assignment.id, selection.plan.path, runtime.runDigest);
}
