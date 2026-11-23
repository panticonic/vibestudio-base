import commitReviewed from "./finishPrivateProject/commitReviewedProject.js";
import type {ProjectEvidenceDecision, ProjectScopeLease, AuthoredProjectDraft, PrivateProjectFinish} from "./types.js";
/** Apply the already chosen policy and semantic review without inventing new admission conditions. */
export default async function finishPrivateProject(decision:ProjectEvidenceDecision,scope:ProjectScopeLease,draft:AuthoredProjectDraft):Promise<PrivateProjectFinish>{
 if(!draft||!draft.review.ready)return {outcome:"review-needed",candidate:draft?.snapshot??null,event:null};
 if(decision.action==="draft")return {outcome:"draft",candidate:draft.snapshot,event:null};
 if(decision.action!=="commit")return {outcome:"held",candidate:draft.snapshot,event:null};
 const event=await commitReviewed(scope,draft);
 return {outcome:event?"committed":"held-moved",candidate:draft.snapshot,event};
}
