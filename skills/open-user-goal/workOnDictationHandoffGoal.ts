import discoverDictationThreads from "./workOnDictationHandoffGoal/workspace/discoverDictationThreads.js";
import readDictationThread from "./workOnDictationHandoffGoal/workspace/readDictationThread.js";
import stageDictationCorrection from "./workOnDictationHandoffGoal/workspace/stageDictationCorrection.js";
import identifyDictationThread from "./workOnDictationHandoffGoal/identifyDictationThread.nl";
import reconcileDictationSegments from "./workOnDictationHandoffGoal/reconcileDictationSegments.nl";
import reviewRetainedDictation from "./workOnDictationHandoffGoal/reviewRetainedDictation.js";
import decideDictationHandoff from "./workOnDictationHandoffGoal/decideDictationHandoff.nl";
import applicationResult from "./workOnDictationHandoffGoal/applicationResult.js";
import type {DictationResult} from "./workOnDictationHandoffGoal/types.js";
export default async function workOnDictationHandoffGoal(goal:string):Promise<DictationResult>{
 const thread=await identifyDictationThread(goal,await discoverDictationThreads());
 const earlier=await readDictationThread(thread.threadId),current=await readDictationThread(thread.threadId);
 if(!earlier||!current)throw new Error("The selected owned dictation frontier is unavailable");
 const selection=await reconcileDictationSegments(goal,thread,earlier,current);
 const review=selection.transcript?await reviewRetainedDictation(goal,selection.transcript):null;
 const plan=await decideDictationHandoff(goal,thread,current,selection,review);
 const local=plan.action==="stage-correction"||plan.action==="stage-alternative";
 const handoff=local&&review?await stageDictationCorrection(plan,review.result):null;
 return applicationResult(plan,review,handoff);
}
