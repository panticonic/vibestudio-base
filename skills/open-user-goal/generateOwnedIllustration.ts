import discoverIllustration from "./generateOwnedIllustration/discoverIllustration.js";
import inspectIllustrationBasis from "./generateOwnedIllustration/inspectIllustrationBasis.js";
import chooseIllustrationAction from "./generateOwnedIllustration/chooseIllustrationAction.nl";
import runIllustrationJob from "./generateOwnedIllustration/runIllustrationJob.js";
import retainIllustrationOriginal from "./generateOwnedIllustration/retainIllustrationOriginal.js";
import type {OwnedIllustrationResult} from "./generateOwnedIllustration/types.js";
/** The semantic action choice feeds exact native job execution and authorized original retention. */
export default async function generateOwnedIllustration(goal:string):Promise<OwnedIllustrationResult>{
 const assignment=await discoverIllustration();
 const basis=await inspectIllustrationBasis(assignment);
 const decision=await chooseIllustrationAction(assignment,basis);
 const outcome=decision.action==="hold"?null:await runIllustrationJob(assignment,basis,decision);
 const saved=basis.saveAllowed&&outcome?.original?await retainIllustrationOriginal(assignment,basis,outcome):null;
 return {outcome,saved};
}
