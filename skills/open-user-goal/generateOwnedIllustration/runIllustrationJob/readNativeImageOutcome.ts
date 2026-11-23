import {illustrationJobs} from "natlang:services";
import type {IllustrationAssignment, IllustrationBasis, IllustrationDecision, IllustrationOutcome} from "../types.js";
/** Read terminal durable job state and verified immutable bytes through an addressed native call. */
export default async function readNativeImageOutcome(assignment: IllustrationAssignment, basis: IllustrationBasis, decision: IllustrationDecision):Promise<IllustrationOutcome>{
 return illustrationJobs.run(assignment.scope, basis.head, decision.action);
}
