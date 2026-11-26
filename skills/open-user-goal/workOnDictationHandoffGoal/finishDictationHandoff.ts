import stageDictationCorrection from './workspace/stageDictationCorrection.js';
import applicationResult from './applicationResult.js';
import type {DictationPlan,DictationDraftWitness,DictationResult} from './types.js';
/** Exact optional native stage; source/current-draft authority remains native. */
export default async function finishDictationHandoff(plan:DictationPlan,review:DictationDraftWitness|null):Promise<DictationResult>{
 const local=plan.action==='stage-correction'||plan.action==='stage-alternative';
 if(local&&!review)throw new Error('A local dictation artifact needs its actual retained draft review.');
 const handoff=local&&review?await stageDictationCorrection(plan,review.result):null;
 return applicationResult(plan,review,handoff);
}
