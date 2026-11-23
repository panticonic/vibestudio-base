import discoverImageBriefs from "./workOnImageCandidateGoal/workspace/discoverImageBriefs.js";
import readImageJournal from "./workOnImageCandidateGoal/workspace/readImageJournal.js";
import readImageOriginal from "./workOnImageCandidateGoal/workspace/readImageOriginal.js";
import stageImageHandoff from "./workOnImageCandidateGoal/workspace/stageImageHandoff.js";
import chooseImageBrief from "./workOnImageCandidateGoal/chooseImageBrief.nl";
import assessImageAttempts from "./workOnImageCandidateGoal/assessImageAttempts.nl";
import decideImageHandoff from "./workOnImageCandidateGoal/decideImageHandoff.nl";
import result from "./workOnImageCandidateGoal/result.js";
import type {ImageCandidateResult,ImageRead,ImageReport} from "./workOnImageCandidateGoal/types.js";
export default async function workOnImageCandidateGoal(goal:string):Promise<ImageCandidateResult>{
 const index=await discoverImageBriefs(),plan=await chooseImageBrief(goal,index);
 const earlier=await readImageJournal(index.channelId),latest=await readImageJournal(index.channelId);
 if(!earlier||!latest)return {candidates:[],originals:[],decision:{action:"hold",candidateId:null,explanation:"The owned image journal is unavailable."},handoff:null};
 const assessment=await assessImageAttempts(goal,index,plan,earlier,latest);
 const reads:ImageRead[]=[];
 for(const candidate of assessment.queue)reads.push(await readImageOriginal(plan.briefId,candidate));
 const decision=await decideImageHandoff(goal,plan,assessment,reads);
 const report:ImageReport={plan,assessment,reads,decision,handoff:null};
 const handoff=decision.action==="stage"?await stageImageHandoff(report):null;
 return result(assessment,reads,decision,handoff);
}
