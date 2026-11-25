/** Actual joint-program loader and scripted semantic gateway; no model/network. */
import {expect,it} from "vitest";
import {readFile,readdir,stat} from "node:fs/promises";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {createEvalNatlang} from "./index.js";
import {fakeRpc,testNewFunction,toolCallMessage} from "./testSupport.js";
const root=fileURLToPath(new URL("../../..",import.meta.url));
async function invoke(name:string,goal:string,services:Record<string,unknown>,codes:string[]){
 let turns=0;
 const {rpc}=fakeRpc({turn:async()=>{const code=codes[turns++];if(!code)throw Error("Unexpected semantic turn");return toolCallMessage("eval",{code,finish:true},{input:0,output:0});}});
 const runtime=createEvalNatlang({newFunction:testNewFunction(),owner:{kind:"user",objectKey:"operational-composition"},bindings:{rpc,fs:{readFile:(path:string)=>readFile(join(root,path),"utf8"),readdir:(path:string)=>readdir(join(root,path),{withFileTypes:true}),stat:(path:string)=>stat(join(root,path))}}});
 try{
  const result=await runtime.runCell(async()=>{
   const natlang=runtime.ambient.natlang as {load(path:string,options:object):Promise<unknown>};
   const program=await natlang.load(`skills/open-user-goal/${name}.nl`,{services}) as (goal:string)=>Promise<unknown>;
   return program(goal);
  },{runId:"operational-composition",signal:new AbortController().signal});
  expect(turns).toBe(codes.length);return result.value;
 }finally{runtime.close();}
}
it("lets the program root compose three explicitly requested authorized native trials, keeping actual null output and no unrequested signature",async()=>{
 const samples=["first","second","third"].map(id=>({id,label:id,purpose:"requested batch",authorization:"initial"}));
 const program={id:"owned-program",label:"Requested program",purpose:"native batch",state:"active",permission:"trial",samples};
 const evidence={kind:"program",goal:"requested batch",path:"main.ts",compiler:"passed",diagnostic:null,call:null,userRequestedRetry:false};
 const inspection={programId:program.id,revision:"native-revision",callable:"check",evidence};
 const calls:string[]=[];
 const result=await invoke("workOnProgramRunGoal","Run each of the three authorized initial samples and preserve their actual outputs. Do not sign.",{
  programRunCatalog:{list:async()=>[program],inspect:async(id:string)=>{expect(id).toBe(program.id);return inspection;}},
  programExecution:{run:async(id:string,revision:string,sample:string)=>{expect(id).toBe(program.id);expect(revision).toBe(inspection.revision);expect(samples.some(s=>s.id===sample)).toBe(true);calls.push(sample);return {id:sample,status:"returned"};},read:async(id:string)=>({id,sampleId:id,revision:inspection.revision,status:"returned",signatureAuthorized:false,verification:"verified",output:null,error:null,evidence})},
  programReceiptSigner:{stage:async()=>{throw Error("No signature was requested");}},
 },[
  'const program=await chooseRunProgram(goal,await runtime.discoverRuns());if(!program)return {status:"unresolved",reason:"program-unavailable"};const inspection=await runtime.inspectProgram(program.id);if(!inspection)return {status:"unresolved",reason:"program-unavailable"};const reviewed=await reviewer.reviewRuntimeEvidence(inspection.evidence);const receipts=[];for(const sample of program.samples){const started=await runtime.runSample(program.id,inspection.revision,sample.id);if(!started)throw Error("Native run unavailable");const receipt=await runtime.readOutputReceipt(started.id);if(!receipt)throw Error("Native readback unavailable");receipts.push(receipt);}return {status:"reviewed",programId:program.id,receipts,signed:null};',
  'return programs[0];',
  'return {kind:"program",next:"call-reviewed-signature",basis:"Actual inspected compiler and callable"};',
 ]);
 expect(calls).toEqual(["first","second","third"]);
 expect(result).toMatchObject({status:"reviewed",programId:program.id,receipts:[{output:null},{output:null},{output:null}],signed:null});
},180000);
it("lets eval recovery retain the actual approved prior result without a new attempt or unrequested handoff",async()=>{
 const digest="a".repeat(64),job={id:"owned-eval",title:"Requested job",summary:"approved prior fallback",state:"active",attempts:[{runId:"prior",role:"prior",label:"Previous",authority:"approved"}]};
 const observation={jobId:job.id,attempt:job.attempts[0],terminal:"failed",runDigest:digest,resultDigest:digest,exactRetryAuthorized:false,request:{goal:"Read the confirmed result",operationId:"actual-effect"}};
 const result=await invoke("workOnEvalHandoffGoal","Read the approved prior output if confirmed. Do not retry or leave a handoff.",{
  openEvalCatalog:{discover:async()=>[job],open:async(jobId:string,runId:string)=>{expect([jobId,runId]).toEqual([job.id,"prior"]);return observation;}},
  openEvalReentry:{retry:async()=>{throw Error("No retry authorized");}},openEvalHandoff:{stage:async()=>{throw Error("No handoff requested");}},
 },[
  'const job=await chooseEvalJob(goal,await journal.discoverEvalJobs());if(!job)return {status:"unresolved",reason:"job-unavailable"};const trials=[];for(const id of await chooseEvalAttempts(goal,job)){const observation=await journal.openEvalAttempt(job.id,id);if(observation)trials.push({observation,review:await reviewer.reviewEvalRecovery(observation.request)});}const decision=await decideEvalHandoff(goal,trials,false);const confirmed=confirmedEvalResult(decision,trials);if(!confirmed)throw Error("Missing actual confirmed result");if(await shouldStageEvalResult(goal,confirmed))throw Error("Unexpected retention request");return applicationResult(job.id,trials,decision,null);',
  'return jobs[0];','return [job.attempts[0].runId];',
  `return {runId:"prior",cell:"failed",journal:"matched",readback:{digest:${JSON.stringify(digest)},observedDigest:${JSON.stringify(digest)},size:42},effect:"confirmed",next:"continue-with-effect",reason:"Independent actual readback"};`,
  'return {action:"use",runId:trials[0].observation.attempt.runId};','return false;',
 ]);
 expect(result).toMatchObject({status:"reviewed",result:{runId:"prior",runDigest:digest,resultDigest:digest,readback:{size:42}},artifact:null});
},180000);
it("keeps authoring discovery hierarchical and returns an actual unresolved selection without invoking review or a write",async()=>{
 let lists=0;
 const result=await invoke("workOnAuthoringGoal","Review the requested current program.",{
  authoringDiscovery:{list:async()=>{lists++;return [];},open:async()=>{throw Error("No candidate exists");}},
  authoringReviewControl:{confirm:async()=>{throw Error("No actual review exists");},stage:async()=>{throw Error("No handoff exists");}},
 },['return discovery.discoverAuthoring(goal);','const choice=await choosePrograms(goal,await authoringDiscovery.list());if(choice.kind!=="hold")throw Error("No candidate");return {status:"unresolved",reason:choice.reason};','return {kind:"hold",reason:"cannot-identify-candidate"};']);
 expect(result).toEqual({status:"unresolved",reason:"cannot-identify-candidate"});expect(lists).toBe(1);
},180000);
