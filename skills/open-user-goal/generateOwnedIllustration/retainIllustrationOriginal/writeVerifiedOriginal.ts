import {illustrationOriginal} from "natlang:services";
import type {IllustrationAssignment, IllustrationBasis, IllustrationOutcome, IllustrationSave} from "../types.js";
/** Save the verified binary at the authorized path only on the exact working head and read it back. */
export default async function writeVerifiedOriginal(assignment: IllustrationAssignment, basis: IllustrationBasis, outcome: IllustrationOutcome):Promise<IllustrationSave>{
 return illustrationOriginal.save(assignment.scope, basis.head, outcome.job.id, outcome.original.digest);
}
