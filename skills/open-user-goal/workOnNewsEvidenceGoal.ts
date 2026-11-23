import reviewNewsEvidence from "./reviewNewsEvidence.js";
import result from "./workOnNewsEvidenceGoal/result.js";
import type {NewsEvidenceResult} from "./workOnNewsEvidenceGoal/types.js";
/** The review owns semantic judgment; this composition preserves its actual application findings. */
export default async function workOnNewsEvidenceGoal(goal:string):Promise<NewsEvidenceResult> {
 return result(await reviewNewsEvidence(goal));
}
