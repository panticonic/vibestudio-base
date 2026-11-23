import discoverRetainedConversations from "./workOnProviderHandoffGoal/workspace/discoverRetainedConversations.js";
import readProviderConversation from "./workOnProviderHandoffGoal/workspace/readProviderConversation.js";
import readProviderOutput from "./workOnProviderHandoffGoal/workspace/readProviderOutput.js";
import stageProviderHandoff from "./workOnProviderHandoffGoal/workspace/stageProviderHandoff.js";
import chooseProviderConversation from "./workOnProviderHandoffGoal/chooseProviderConversation.nl";
import reviewRetainedApproval from "./workOnProviderHandoffGoal/reviewRetainedApproval.nl";
import chooseRetainedResult from "./workOnProviderHandoffGoal/chooseRetainedResult.nl";
import reviewRetainedDelivery from "./workOnProviderHandoffGoal/reviewRetainedDelivery.nl";
import decideProviderHandoff from "./workOnProviderHandoffGoal/decideProviderHandoff.nl";
import shouldStageProviderHandoff from "./workOnProviderHandoffGoal/shouldStageProviderHandoff.nl";
import applicationResult from "./workOnProviderHandoffGoal/applicationResult.js";
import type {ProviderResult} from "./workOnProviderHandoffGoal/types.js";

/** Reuse existing consent and delivery judgments over the exact retained native conversation. */
export default async function workOnProviderHandoffGoal(goal:string):Promise<ProviderResult>{
 const card=await chooseProviderConversation(goal,await discoverRetainedConversations());
 const earlier=await readProviderConversation(card.channelId),current=await readProviderConversation(card.channelId);
 if(!earlier||!current)throw new Error("The selected retained provider conversation is unavailable");
 const approval=await reviewRetainedApproval(goal,card,earlier,current);
 const selection=await chooseRetainedResult(goal,card,current,approval.result);
 const output=selection.read&&selection.resultMessage?await readProviderOutput(card.channelId,selection.resultMessage):null;
 const delivery=await reviewRetainedDelivery(goal,card,current,selection,output);
 const plan=await decideProviderHandoff(goal,card,current,approval.result,selection,delivery.result,output);
 const retain=card.mayStage&&plan.disposition==="ready"&&await shouldStageProviderHandoff(goal,card);
 const handoff=retain?await stageProviderHandoff(plan):null;
 return applicationResult(plan,handoff);
}
