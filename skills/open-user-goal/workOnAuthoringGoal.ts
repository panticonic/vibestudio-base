import discoverAuthoring from "./workOnAuthoringGoal/discovery/discoverAuthoring.nl";
import confirmAuthoringReview from "./workOnAuthoringGoal/discovery/confirmAuthoringReview.js";
import writeAuthoringHandoff from "./workOnAuthoringGoal/discovery/writeAuthoringHandoff.js";
import reviewProgram from "./workOnAuthoringGoal/reviewer/reviewProgram.nl";
import decideHandoff from "./workOnAuthoringGoal/decideHandoff.nl";
import type {AuthoringOpenOutcome} from "./workOnAuthoringGoal/discovery/types.js";

/** Compose native operations and scoped semantic judgments for the requested goal. */
export default async function workOnAuthoringGoal(goal:string):Promise<AuthoringOpenOutcome>{
 for(let attempt=0;attempt<2;attempt++){
  const discovered=await discoverAuthoring(goal);
  if(discovered.status!=="selected")return discovered;
  const review=await reviewProgram(discovered.value.request);
  const receipt={selection:discovered.value.selection,review};
  const confirmed=await confirmAuthoringReview(receipt);
  if(confirmed!=="current"){if(attempt===1)return {status:"unresolved",reason:"source-kept-changing"};continue;}
  const disposition=await decideHandoff(goal,receipt);
  const artifact=disposition==="stage"?await writeAuthoringHandoff(receipt):null;
  return {status:"reviewed",receipt,artifact};
 }
 return {status:"unresolved",reason:"source-kept-changing"};
}
