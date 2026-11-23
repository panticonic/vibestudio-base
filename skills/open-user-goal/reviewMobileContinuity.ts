import selectProfile from "./reviewMobileContinuity/selectProfile.nl";
import auditContinuity from "./reviewMobileContinuity/auditContinuity.nl";
import decideContinuity from "./reviewMobileContinuity/decideContinuity.nl";
import type {MobileContinuityOutcome} from "./types.js";

/** Compose native operations and scoped semantic judgments for the requested goal. */
export default async function reviewMobileContinuity(goal:string):Promise<MobileContinuityOutcome>{
 const profile=await selectProfile(goal);
 const evidence=await auditContinuity(profile.id);
 const decision=await decideContinuity(goal,profile,evidence);
 return {profile:profile.id,...decision};
}
