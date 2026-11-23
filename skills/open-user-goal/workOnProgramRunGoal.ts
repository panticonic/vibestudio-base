import type {RuntimeProgramInput,ProgramRunReview} from "./workOnProgramRunGoal/runtime/types.js";
import discoverRuns from "./workOnProgramRunGoal/runtime/discoverRuns.js";
import inspectProgram from "./workOnProgramRunGoal/runtime/inspectProgram.js";
import runSample from "./workOnProgramRunGoal/runtime/runSample.js";
import readOutputReceipt from "./workOnProgramRunGoal/runtime/readOutputReceipt.js";
import signVerifiedRun from "./workOnProgramRunGoal/runtime/signVerifiedRun.js";
import reviewRuntimeEvidence from "./workOnProgramRunGoal/reviewer/reviewRuntimeEvidence.nl";
import type {ProgramOutputReceipt} from "./workOnProgramRunGoal/runtime/types.js";
import chooseRunProgram from "./workOnProgramRunGoal/chooseRunProgram.nl";
import chooseRunSample from "./workOnProgramRunGoal/chooseRunSample.nl";
import decideRunContinuation from "./workOnProgramRunGoal/decideRunContinuation.nl";
import shouldSignOutput from "./workOnProgramRunGoal/shouldSignOutput.nl";
import type {ProgramRunReport} from "./workOnProgramRunGoal/runtime/types.js";

/** Compose native operations and scoped semantic judgments for the requested goal. */
export default async function workOnProgramRunGoal(goal:string):Promise<ProgramRunReport>{
 async function reviewProgramEvidence(evidence:RuntimeProgramInput):Promise<ProgramRunReview>{
  const reviewed=await reviewRuntimeEvidence(evidence);
  if(reviewed.kind!=="program")throw new Error("Program evidence must return its actual program-domain judgment");
  return reviewed;
 }
 const program=await discoverRuns().then(rows=>chooseRunProgram(goal,rows));
 if(!program)return {status:"unresolved",reason:"program-unavailable"};
 let inspection=await inspectProgram(program.id);
 if(!inspection)return {status:"unresolved",reason:"program-unavailable"};
 let review=await reviewProgramEvidence(inspection.evidence);
 let sample=await chooseRunSample(goal,program,inspection,review);
 const receipts:ProgramOutputReceipt[]=[];
 for(let attempt=0;sample!==null&&attempt<2;attempt++){
  if(attempt>0){
   const current=await inspectProgram(program.id);
   if(!current)return {status:"unresolved",reason:"program-unavailable"};
   inspection=current;review=await reviewProgramEvidence(inspection.evidence);
   if(!inspection.callable)break;
  }
  const started=await runSample(program.id,inspection.revision,sample);
  if(!started)return {status:"unresolved",reason:"run-not-bound"};
  const receipt=await readOutputReceipt(started.id);
  if(!receipt)return {status:"unresolved",reason:"receipt-unavailable"};
  receipts.push(receipt);review=await reviewProgramEvidence(receipt.evidence);
  sample=attempt===0?await decideRunContinuation(goal,program,receipt,review):null;
 }
 const last=receipts.at(-1);
 const signed=last&&await shouldSignOutput(goal,program,last,review)?await signVerifiedRun(last.id):null;
 return {status:"reviewed",programId:program.id,receipts,signed};
}
