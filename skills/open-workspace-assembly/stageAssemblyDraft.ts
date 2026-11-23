import {assemblyDraft} from "natlang:services";
import type {AssemblyHandoff, AssemblyPlan} from "./types.js";
/** Write an authorized owned assembly manifest and plan as a local scratch draft. */
export default async function stageAssemblyDraft(plan: AssemblyPlan):Promise<AssemblyHandoff | null>{
 return assemblyDraft.stage(plan);
}
