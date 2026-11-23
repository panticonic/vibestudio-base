import {contentProjectCommit} from "natlang:services";
import type {ProjectScopeLease, AuthoredProjectDraft} from "../types.js";
/** Commit the actual reviewed candidate; the service owns current consent and CAS validation. */
export default async function commitReviewedProject(scope:ProjectScopeLease,draft:AuthoredProjectDraft):Promise<{eventId:string;head:string}|null>{
 if(!draft||!draft.review.ready)return null;
 return contentProjectCommit.commit(scope.receipt,draft.snapshot.head,scope.request?.goal||"Prepare private content project");
}
