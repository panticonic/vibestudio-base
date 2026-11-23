import discoverWelcomeResources from "./workOnPersonalWelcomeGoal/workspace/discoverWelcomeResources.js";
import readWelcomeFrontier from "./workOnPersonalWelcomeGoal/workspace/readWelcomeFrontier.js";
import resolveWelcomeResource from "./workOnPersonalWelcomeGoal/workspace/resolveWelcomeResource.js";
import stageWelcomeNextStep from "./workOnPersonalWelcomeGoal/workspace/stageWelcomeNextStep.js";
import chooseWelcomeResource from "./workOnPersonalWelcomeGoal/chooseWelcomeResource.nl";
import reconcileWelcomeEvidence from "./workOnPersonalWelcomeGoal/reconcileWelcomeEvidence.nl";
import reviewWelcomeSetup from "./workOnPersonalWelcomeGoal/reviewWelcomeSetup.js";
import reviewWelcomeTour from "./workOnPersonalWelcomeGoal/reviewWelcomeTour.js";
import retryWelcomeProbe from "./workOnPersonalWelcomeGoal/retryWelcomeProbe.js";
import decideWelcomeNextStep from "./workOnPersonalWelcomeGoal/decideWelcomeNextStep.nl";
import applicationResult from "./workOnPersonalWelcomeGoal/applicationResult.js";
import type {WelcomeResult,WelcomeReviews} from "./workOnPersonalWelcomeGoal/types.js";

/** Native discovery and readback compose the existing resource, authority and next-step judgments. */
export default async function workOnPersonalWelcomeGoal(goal:string):Promise<WelcomeResult>{
 const index=await discoverWelcomeResources(),choice=await chooseWelcomeResource(goal,index);
 const earlier=await readWelcomeFrontier(index.scope.channelId),current=await readWelcomeFrontier(index.scope.channelId);
 if(!earlier||!current)throw new Error("The owned Personal first-run frontier is unavailable");
 const resolved=choice.id?await resolveWelcomeResource(choice.id):null;
 const evidence=await reconcileWelcomeEvidence(index,choice,earlier,current,resolved);
 const resource=index.resources.find(item=>item.id===choice.id);
 const row=current.rows.find(item=>item.messageId===evidence.message);
 const reviews:WelcomeReviews={setup:null,tour:null,probe:null};
 if(resource?.kind==="setup"||resource?.kind==="chooser")reviews.setup=await reviewWelcomeSetup(goal,index.scope.intent);
 if(evidence.reason==="verified-current"&&row?.record.kind==="tour"&&resolved?.scene)reviews.tour=await reviewWelcomeTour(goal,row,resolved.scene,resolved.sceneCount);
 if(evidence.reason==="retry-ready"&&resolved?.probe)reviews.probe=await retryWelcomeProbe(resolved.probe);
 const plan=await decideWelcomeNextStep(goal,index,choice,current,evidence,resolved,reviews);
 const handoff=plan.action==="stage"?await stageWelcomeNextStep(plan,reviews):null;
 return applicationResult(plan,reviews,handoff);
}
