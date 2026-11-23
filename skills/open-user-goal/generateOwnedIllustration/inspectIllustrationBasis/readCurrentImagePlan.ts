import {illustrationEvidence} from "natlang:services";
import type {IllustrationAssignment, IllustrationBasis} from "../types.js";
/** Read native image status and the exact local creation preconditions. */
export default async function readCurrentImagePlan(assignment: IllustrationAssignment):Promise<IllustrationBasis>{
 return illustrationEvidence.read(assignment.scope);
}
