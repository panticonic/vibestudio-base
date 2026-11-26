import stageImageHandoff from './workspace/stageImageHandoff.js';
import result from './result.js';
import type {ImageInvestigation,ImageDecision,ImageCandidateResult,ImageReport} from './types.js';
/** Exact optional native write and result projection; semantic decisions stay in NL. */
export default async function finishImageHandoff(evidence:ImageInvestigation,decision:ImageDecision):Promise<ImageCandidateResult>{
 if(!decision.explanation.trim())throw new Error('An image decision needs its actual explanation.');
 if(!evidence.plan){
  if(decision.action!=='hold'||decision.candidateId!==null)throw new Error('An unavailable image scope cannot authorize an image result.');
  return result(evidence.assessment,evidence.reads,decision,null);
 }
 const report:ImageReport={plan:evidence.plan,assessment:evidence.assessment,reads:evidence.reads,decision,handoff:null};
 const handoff=decision.action==='stage'?await stageImageHandoff(report):null;
 return result(evidence.assessment,evidence.reads,decision,handoff);
}
