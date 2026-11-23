import readSources from "./reviewProjectEvidence/readOwnedProjectSources.js";
import {dispositionEvidence,bindDisposition} from "./reviewProjectEvidence/bindDisposition.js";
import chooseDisposition from "./reviewProjectEvidence/chooseProjectDisposition.nl";
import type {ProjectEvidenceReview, ProjectEvidenceDecision} from "./types.js";
/** Preserve the native source observation around the semantic disposition policy. */
export default async function reviewProjectEvidence(goal:string):Promise<{evidence:ProjectEvidenceReview;decision:ProjectEvidenceDecision}>{
 const evidence=await readSources();
 const decision=bindDisposition(evidence,await chooseDisposition(goal,dispositionEvidence(evidence)));
 return {evidence,decision};
}
