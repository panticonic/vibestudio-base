import {workspaceSmokeRuntime} from "natlang:services";
import type {SmokeAssignment, SmokePlan, SmokeRuntime} from "../types.js";
/** Invoke the exact safe installed public export using the selected file's fixture. */
export default async function readActualSmokeResult(assignment: SmokeAssignment, plan: SmokePlan):Promise<SmokeRuntime>{
 return workspaceSmokeRuntime.run(assignment.id, plan.path, plan.digest);
}
