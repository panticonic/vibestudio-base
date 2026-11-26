/** Actual public joint-loader controls; scripted model/native ports are not training data. */
import {expect,it,vi} from 'vitest';
import {readFile,readdir,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {URL as NodeURL,fileURLToPath} from 'node:url';
import {createEvalNatlang} from './index.js';
import {fakeRpc,testNewFunction,toolCallMessage} from './testSupport.js';
const base=fileURLToPath(new NodeURL('../../..',import.meta.url));
async function execute(path:string,goal:string,codes:string[],services:object){
 let turns=0;
 const {rpc}=fakeRpc({turn:async()=>{const code=codes[turns++];if(!code)throw Error('Unexpected extra semantic call');return toolCallMessage('eval',{code,finish:true},{input:0,output:0});}});
 const runtime=createEvalNatlang({newFunction:testNewFunction(),owner:{kind:'user',objectKey:'media-domain-composition-control'},bindings:{rpc,fs:{readFile:(path:string)=>readFile(join(base,path),'utf8'),readdir:(path:string)=>readdir(join(base,path),{withFileTypes:true}),stat:(path:string)=>stat(join(base,path))}}});
 try{
  const result=await runtime.runCell(async()=>{const natlang=runtime.ambient.natlang as {load(path:string,options:object):Promise<unknown>};const program=await natlang.load(path,{services}) as (goal:string)=>Promise<unknown>;return program(goal)},{runId:'media-domain-composition-control',signal:new AbortController().signal});
  expect(turns).toBe(codes.length);return result.value;
 }finally{await runtime.close()}
}
it('loads model-owned image investigation and stages only the actual native original and receipt',async()=>{
 const brief={id:'owned-brief',project:'owned-project',title:'Current poster',intent:'A clear local workshop poster',formats:['png'],reference:null,outputPurpose:'private-local',owner:'owned-owner'};
 const index={channelId:'owned-channel',owner:'owned-owner',briefs:[brief]};
 const candidate={kind:'candidate',briefId:brief.id,owner:index.owner,label:'current',jobId:'native-job',attempt:1,state:'succeeded',candidateId:'native-candidate',assetId:'native-asset',assetDigest:'native-digest',providerReceipt:'native-provider-receipt',prompt:brief.intent,revisedPrompt:brief.intent,reference:null,format:'png',outputPath:'poster.png',save:'applied'};
 const journal={channelId:index.channelId,through:1,rows:[{id:'native-row',seq:1,record:candidate}]};
 const original={candidateId:candidate.candidateId,rowId:'native-row',status:'verified',original:{id:'native-asset',digest:'native-digest',mime:'image/png',width:64,height:64,byteLength:1024}};
 const receipt={path:'/.tmp/owned-image/handoff.json',digest:'actual-handoff-digest',candidateId:candidate.candidateId,assetDigest:'native-digest',frontier:1};
 const read=vi.fn(async()=>journal),inspect=vi.fn(async()=>original),stage=vi.fn(async(report:any)=>{expect(report.reads).toEqual([original]);expect(report.decision.candidateId).toBe(candidate.candidateId);expect(report.plan.briefId).toBe(brief.id);return receipt});
 const codes=[
  'const evidence=await investigateImageCandidates(goal);if(!evidence.plan)throw Error("No owned brief");const decision=await decideImageHandoff(goal,evidence.plan,evidence.assessment,evidence.reads);return finishImageHandoff(evidence,decision);',
  'const index=await discoverImageBriefs();const plan=await chooseImageBrief(goal,index);const observed=await readImageJournal(index.channelId);if(!observed)throw Error("No native journal");const observations=[observed];const assessment=await assessImageAttempts(goal,index,plan,observations);const reads=[];for(const id of assessment.queue)reads.push(await readImageOriginal(plan.briefId,id));return {plan,assessment,reads};',
  'return {briefId:index.briefs[0].id,mode:"current",historicalLabel:null,localHandoff:true,acceptedFormats:index.briefs[0].formats};',
  'const row=observations.at(-1).rows.find(row=>row.record.kind==="candidate");if(!row||row.record.kind!=="candidate")throw Error("No observed candidate");const candidate=row.record;return {queue:[candidate.candidateId],candidates:[{id:candidate.candidateId,reasons:["Requested current native original"],eligible:true}]};',
  'return {action:"stage",candidateId:reads[0].candidateId,explanation:"The current original is native PNG and authorized for a private local handoff."};',
 ];
 const result=await execute('skills/open-user-goal/workOnImageCandidateGoal.nl','Stage a private brief from the current verified owned PNG poster.',codes,{imageCandidateBriefs:{list:async()=>index},imageCandidateJournal:{read},imageCandidateOriginal:{read:inspect},imageCandidateHandoff:{stage}}) as any;
 expect(read).toHaveBeenCalledTimes(1);expect(inspect).toHaveBeenCalledTimes(1);expect(stage).toHaveBeenCalledTimes(1);expect(result.originals).toEqual([original]);expect(result.handoff).toEqual(receipt);
},180000);
it('loads retained-dictation investigation and preserves an unconfirmed capture without inventing text or staging',async()=>{
 const thread={threadId:'owned-thread',title:'Workshop capture',owner:'owned-owner',draftId:'owned-draft',baseline:'revision-1',device:'owned-device',language:'en',usePrefix:false,localAction:'none'};
 const snapshot={threadId:thread.threadId,through:2,rows:[{messageId:'native-capture-message',envelopeId:'capture-envelope',seq:1,senderId:'owned-owner',record:{kind:'capture',captureId:'native-capture',owner:thread.owner,draftId:thread.draftId,device:thread.device,language:thread.language,state:'finished'}},{messageId:'native-draft-message',envelopeId:'draft-envelope',seq:2,senderId:'owned-owner',record:{kind:'draft',draftId:thread.draftId,revision:'revision-1',state:'editable',text:'Original draft'}}]};
 const read=vi.fn(async()=>snapshot),stage=vi.fn(async()=>{throw Error('Read-only unconfirmed dictation cannot stage')});
 const codes=[
  'const evidence=await investigateRetainedDictation(goal);if(!evidence.thread||!evidence.selection)throw Error("No owned evidence");const current=evidence.observations.at(-1);const plan=await decideDictationHandoff(goal,evidence.thread,current,evidence.selection,null);return finishDictationHandoff(plan,null);',
  'const thread=await identifyDictationThread(goal,await discoverDictationThreads());const observed=await readDictationThread(thread.threadId);if(!observed)throw Error("No native state");const observations=[observed];return {thread,observations,selection:await reconcileDictationSegments(goal,thread,observations)};',
  'return threads[0];',
  'const current=observations.at(-1);const boundary=await resolveDictationProvenance(thread,current);if(boundary.status!=="held")throw Error("Expected actual unconfirmed source");return {captureId:boundary.captureId,segmentMessages:[],draftRevision:"revision-1",acknowledgementMessage:boundary.messageId,transcript:null,reason:boundary.reason};',
  'const row=current.rows.find(row=>row.record.kind==="capture");if(!row||row.record.kind!=="capture")throw Error("No actual capture");return {status:"held",reason:"unconfirmed",captureId:row.record.captureId,messageId:null};',
  'return {...selection,threadId:thread.threadId,through:current.through,draftId:thread.draftId,action:"hold",explanation:"The capture has no confirming acknowledgment; no retained text is claimed."};',
 ];
 const result=await execute('skills/open-user-goal/workOnDictationHandoffGoal.nl','Is this owned dictation capture confirmed? Keep this read-only.',codes,{retainedDictationIndex:{list:async()=>[thread]},retainedDictationState:{read},retainedDictationHandoff:{stage}}) as any;
 expect(read).toHaveBeenCalledTimes(1);expect(stage).not.toHaveBeenCalled();expect(result.plan.reason).toBe('unconfirmed');expect(result.plan.transcript).toBeNull();expect(result.review).toBeNull();expect(result.handoff).toBeNull();
},180000);
