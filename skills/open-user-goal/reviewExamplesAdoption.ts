import findStagedComposition from "./reviewExamplesAdoption/findStagedComposition.nl";
import inspectComposition from "./reviewExamplesAdoption/inspectComposition.nl";
import planAdoptionHandoff from "./reviewExamplesAdoption/planAdoptionHandoff.nl";
import confirmAdoptionFrontier from "./reviewExamplesAdoption/confirmAdoptionFrontier.js";
import holdChangedReview from "./reviewExamplesAdoption/holdChangedReview.nl";
import recordPrivateAdoption from "./reviewExamplesAdoption/recordPrivateAdoption.js";
import readAdoptionHandoff from "./reviewExamplesAdoption/readAdoptionHandoff.js";
import finishAdoptionHandoff from "./reviewExamplesAdoption/finishAdoptionHandoff.js";
import type {AdoptionOutcome} from "./types.js";

/** Compose native operations and scoped semantic judgments for the requested goal. */
export default async function reviewExamplesAdoption(goal:string):Promise<AdoptionOutcome>{
 const card=await findStagedComposition(goal);
 const evidence=await inspectComposition(card);
 let plan=await planAdoptionHandoff(goal,card,evidence);
 const gate=await confirmAdoptionFrontier(card.id,card.event);
 if(gate.status!=="current")plan=await holdChangedReview(plan,gate);
 const receipt=gate.status==="current"&&plan.disposition==="record-private"?await recordPrivateAdoption(card.id,card.event,plan):null;
 await readAdoptionHandoff(card.id,receipt?.path??null);
 return finishAdoptionHandoff(plan,receipt);
}
