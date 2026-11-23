import planAgenticChange from "./reviewSpecialistHistory/development/planAgenticChange.nl";
import type {Result,OriginalArtifact,HistoryReview} from "./types.js";
export default async function reviewSpecialistHistory(result:Result,original:OriginalArtifact):Promise<HistoryReview>{
 const goal=original.text,units={owner:result.owner,consumers:result.consumers,blockers:[]};
 return {goal,units,result:await planAgenticChange.reviewImpact.reviewHistory(goal,units)};
}
