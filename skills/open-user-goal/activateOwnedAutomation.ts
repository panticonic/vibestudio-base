import reviewLaunchEvidence from "./activateOwnedAutomation/reviewLaunchEvidence.nl";
import completeAutomationLaunch from "./activateOwnedAutomation/completeAutomationLaunch.nl";
import type {OwnedAutomationActivationReport} from "./activateOwnedAutomation/types.js";

/** Compose native operations and scoped semantic judgments for the requested goal. */
export default async function activateOwnedAutomation(goal:string):Promise<OwnedAutomationActivationReport>{
 const review=await reviewLaunchEvidence(goal);
 const {activation}=await completeAutomationLaunch(review);
 const {action,basis,reason}=review.decision;
 return {decision:{action,basis,reason},activation};
}
