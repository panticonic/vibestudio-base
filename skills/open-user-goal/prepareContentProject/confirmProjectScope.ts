import {contentProjectScope} from "natlang:services";
import type {ProjectEvidenceDecision, ProjectEvidenceReview, ProjectScopeLease} from "./types.js";
/** Bind the exact source selection and authorized project action to the observed working revision. */
export default async function confirmProjectScope(evidence: ProjectEvidenceReview, decision: ProjectEvidenceDecision):Promise<ProjectScopeLease>{
 return contentProjectScope.confirm(evidence.revision, decision);
}
