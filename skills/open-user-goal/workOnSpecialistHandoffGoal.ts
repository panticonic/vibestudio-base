import discoverCurrentSpecialists from "./workOnSpecialistHandoffGoal/workspace/discoverCurrentSpecialists.js";
import readRetainedSpecialistRun from "./workOnSpecialistHandoffGoal/workspace/readRetainedSpecialistRun.js";
import readOriginalSpecialistArtifact from "./workOnSpecialistHandoffGoal/workspace/readOriginalSpecialistArtifact.js";
import stageSpecialistHandoff from "./workOnSpecialistHandoffGoal/workspace/stageSpecialistHandoff.js";
import manageChannelAgent from "./workOnSpecialistHandoffGoal/agents/manageChannelAgent.nl";
import chooseCurrentSpecialist from "./workOnSpecialistHandoffGoal/chooseCurrentSpecialist.nl";
import checkSpecialistReceipt from "./workOnSpecialistHandoffGoal/checkSpecialistReceipt.nl";
import reviewSpecialistHistory from "./workOnSpecialistHandoffGoal/reviewSpecialistHistory.js";
import decideSpecialistHandoff from "./workOnSpecialistHandoffGoal/decideSpecialistHandoff.nl";
import applicationResult from "./workOnSpecialistHandoffGoal/applicationResult.js";
import type {SpecialistResult,MembershipWitness,HistoryReview,SpecialistMembershipRequest} from "./workOnSpecialistHandoffGoal/types.js";

/** Preserve original specialist identity and bytes while semantic judgments choose the eligible handoff. */
export default async function workOnSpecialistHandoffGoal(goal:string):Promise<SpecialistResult>{
 const index=await discoverCurrentSpecialists(),choice=await chooseCurrentSpecialist(goal,index);
 let membership:MembershipWitness|null=null;
 if(choice.handle){
  const request:SpecialistMembershipRequest={goal,channelId:index.scope.channelId,contextId:index.scope.contextId,handle:choice.handle,action:"inspect",options:null};
  const report=await manageChannelAgent(request);
  if(report.status!=="observed"&&report.status!=="held")throw new Error("A specialist inspection returned a membership-changing disposition");
  membership={request,report:{...report,status:report.status}};
 }
 const earlier=await readRetainedSpecialistRun(index.scope.channelId),current=await readRetainedSpecialistRun(index.scope.channelId);
 if(!earlier||!current)throw new Error("The owned specialist frontier is unavailable");
 const joined=await checkSpecialistReceipt(index.scope,choice,current,membership?.report??null);
 const result=joined.reason==="verified"?current.rows.find(row=>row.messageId===joined.resultMessage&&row.record.kind==="result")?.record:null;
 const original=joined.reason==="verified"&&joined.resultMessage?await readOriginalSpecialistArtifact(index.scope.channelId,joined.resultMessage):null;
 let history:HistoryReview|null=null;
 if(original&&result?.kind==="result")history=await reviewSpecialistHistory(result,original);
 const plan=await decideSpecialistHandoff(goal,index,choice,current,joined,original,history);
 const handoff=plan.action==="stage"&&history?await stageSpecialistHandoff(plan,history):null;
 return applicationResult(plan,membership,history,handoff);
}
