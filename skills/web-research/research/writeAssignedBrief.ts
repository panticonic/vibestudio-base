import researchBrief from "./researchBrief.nl";
import type {AssignedResearchRequest, CitedBrief} from "./types.js";
/** Preserve the caller's assigned scope and observation date around semantic research. */
export default async function writeAssignedBrief(request:AssignedResearchRequest):Promise<CitedBrief>{
 return researchBrief(request.goal,request.sources,request.retrievedAt);
}
