import {expect,it} from 'vitest';
import {readFile,readdir,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createEvalNatlang} from './index.js';
import {fakeRpc,testNewFunction,toolCallMessage} from './testSupport.js';
const base=fileURLToPath(new URL('../../..',import.meta.url));
const roots=[base,process.env.VIBE_SYSTEM_TEMPLATE!].filter(Boolean);
async function first<T>(op:(root:string)=>Promise<T>){let failure;for(const root of roots)try{return await op(root);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;failure=error;}throw failure;}
async function directory(p:string){const found=new Map<string,import('node:fs').Dirent>();let exists=false;let failure;for(const root of roots)try{for(const e of await readdir(join(root,p),{withFileTypes:true}))if(!found.has(e.name))found.set(e.name,e);exists=true;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;failure=error;}if(!exists)throw failure;return [...found.values()];}
async function invoke(path:string,services:Record<string,unknown>,codes:string[],goal:string,expectedBranch:string|null){let turns=0;const records:{call_id:string;parent_call_id:string|null;definition:{source:string}}[]=[];const {rpc}=fakeRpc({records:{record:(input)=>{records.push(input.record);return {recordId:input.record.call_id};}},turn:async()=>{const code=codes[turns++];if(!code)throw Error('Unexpected semantic continuation');return toolCallMessage('eval',{code,finish:true},{input:0,output:0});}});const runtime=createEvalNatlang({newFunction:testNewFunction(),owner:{kind:'user',objectKey:'observation-review-composition'},bindings:{rpc,fs:{readFile:(p:string)=>first(root=>readFile(join(root,p),'utf8')),stat:(p:string)=>first(root=>stat(join(root,p))),readdir:directory}}});try{const result=await runtime.runCell(async()=>{const n=runtime.ambient.natlang as {load(p:string,o:object):Promise<unknown>};const f=await n.load(path,{services}) as (goal:string)=>Promise<unknown>;return f(goal);},{runId:'observation-review-composition',signal:new AbortController().signal});expect(turns).toBe(codes.length);const root=records.find(r=>r.parent_call_id===null&&r.definition.source.endsWith(path.split("/").at(-1)!));expect(root).toBeDefined();if(expectedBranch)expect(records.some(r=>r.parent_call_id===root!.call_id&&r.definition.source.endsWith(expectedBranch))).toBe(true);else expect(records.some(r=>r.definition.source.endsWith("collectRecordedEvidence.nl"))).toBe(false);return result.value;}finally{runtime.close();}}
it('lets the natural desktop root inspect the requested retained layout without demanding unrelated update interpretation',async()=>{
 const desk={id:'desk',name:'Rehearsal Desk',operationId:'operation'};const calls:string[]=[];
 const services={desktopReadiness:{discover:async()=>{calls.push('discover');return[desk];},readWindow:async(id:string)=>{expect(id).toBe(desk.id);calls.push('readWindow');return{deskId:id,status:'restored',before:null,current:{width:840,focused:'records',resident:['right'],parkedLeft:['left'],parkedRight:[],columns:[]},queuedFocus:null,pendingPlacementEdit:false};},readUpdates:async()=>{throw Error('This layout question does not request update interpretation');}}};
 const result=await invoke('skills/open-user-goal/reviewDesktopReadiness.nl',services,[
  'const desk=await locateDesktopDesk(goal);const evidence=await inspectDesktopEvidence(goal,desk);return {reason:evidence.window?.current?.parkedLeft.includes("left")?"The retained schedule is parked at the narrow viewport, not removed. Widening the viewport can reveal the retained left column without rebuilding.":"The inspected layout does not establish a parked schedule."};',
  'const desks=await desktopReadiness.discover();return desks[0]!;',
  'return {desk,admission:null,window:await inspectDesktopWindow(desk),updates:null};',
 ],'Rehearsal Desk is narrow. Find whether the schedule is parked or gone and explain how to keep working without rebuilding.','inspectDesktopEvidence.nl');
 expect(result).toEqual({reason:'The retained schedule is parked at the narrow viewport, not removed. Widening the viewport can reveal the retained left column without rebuilding.'});expect(calls).toEqual(['discover','readWindow']);
},180000);
it('composes real recorded evidence and keeps a counteraction identity distinct from the selected proposal',async()=>{
 const assignment={id:'question',goal:'Recover the recorded dock trial limitation.',scope:'projects/dock'};const candidate={ref:'proposal',rationale:'Trial the smaller loading vehicle',tier:'stated',excerpt:'Actual recorded proposal'};const cohort={ref:'proposal',paths:[{path:'dock/layout.md',count:1}],complete:true};const reason='The smaller trailer could not make the return turn';const calls:string[]=[];
 const services={recordedQuestionDiscovery:{discover:async()=>{calls.push('discover');return assignment;},search:async(id:string,phrase:string)=>{expect(id).toBe(assignment.id);expect(phrase).toBe('dock trial');calls.push('search');return[candidate];}},recordedQuestionGraph:{cohort:async(id:string,ref:string)=>{expect([id,ref]).toEqual(['question','proposal']);calls.push('cohort');return cohort;},rejections:async(id:string,ref:string,basis:unknown)=>{expect([id,ref,basis]).toEqual(['question','proposal',cohort]);calls.push('rejections');return[{path:'dock/layout.md',counteractionRef:'later-attempt',attempted:'Attempted the dock trial',reason}];}}};
 const result=await invoke('skills/open-user-goal/reviewRecordedQuestion.nl',services,[
  'const assignment=await discoverRecordedQuestion();const candidates=await findRecordedProposal(assignment,"dock trial");const selection=await selectRecordedProposal(assignment,candidates);const evidence=selection.ref?await collectRecordedEvidence(goal,assignment,selection.ref):null;return answerRecordedQuestion(goal,assignment,candidates,selection,evidence);',
  'return {ref:candidates[0]!.ref,blocker:null};',
  'const cohort=await readWorkCohort(assignment,ref);return {cohort,withdrawn:await readRejectionRecord(assignment,ref,cohort)};',
  'const actions=evidence?.withdrawn??[];return {answer:actions.map(item=>item.reason).join("; ")};',
 ],assignment.goal,'collectRecordedEvidence.nl');
 expect(result).toEqual({answer:reason});expect(calls).toEqual(['discover','search','cohort','rejections']);
},180000);

it('lets the desktop evidence branch answer a retained-build question without an unrelated layout/source route',async()=>{
 const desk={id:'rain',name:'Rain Gauge Desk',operationId:'rain-operation'};let reads=0;
 const services={desktopReadiness:{discover:async()=>[desk],readWindow:async()=>{throw Error('No layout question was requested');},readUpdates:async(id:string)=>{expect(id).toBe(desk.id);reads++;return{deskId:id,runningBuild:'running',currentBuild:'running',before:[],current:[{clientId:'browser',source:'clients/desktop-browser',runtime:'web',buildKey:'candidate-key',toVersion:null,fromVersion:null,canRollback:false}],notices:[],events:[],admissionPending:false,previousBuilds:[],portCalls:0};}}};
 const result=await invoke('skills/open-user-goal/reviewDesktopReadiness.nl',services,[
  'const desk=await locateDesktopDesk(goal);const evidence=await inspectDesktopEvidence(goal,desk);const offer=evidence.updates?.current[0];if(!offer?.buildKey)throw Error("No actual build identity");return {reason:`The retained candidate has build key ${offer.buildKey}; absent version labels do not erase that identity. It can be reviewed without installing it.`};',
  'const desks=await desktopReadiness.discover();return desks[0]!;',
  'return {desk,admission:null,window:null,updates:await inspectDesktopUpdates(desk)};',
 ],'Rain Gauge Desk has a valid next build key but blank version fields. Confirm whether to review it and cite the identity that exists.','inspectDesktopEvidence.nl');
 expect(result).toEqual({reason:'The retained candidate has build key candidate-key; absent version labels do not erase that identity. It can be reviewed without installing it.'});expect(reads).toBe(1);
},180000);
it('returns the actual ambiguity without inventing a proposal scope or demanding unrelated graph reads',async()=>{
 const assignment={id:'ambiguous',goal:'There are two east-door pilot records. What can we actually establish for tonight?',scope:'projects/owned'};let searches=0;
 const services={recordedQuestionDiscovery:{discover:async()=>assignment,search:async()=>{searches++;return[{ref:'one',rationale:'Pilot for team one',tier:'stated',excerpt:'First actual record'},{ref:'two',rationale:'Separate pilot for team two',tier:'stated',excerpt:'Second actual record'}];}},recordedQuestionGraph:{cohort:async()=>{throw Error('No unique selected record');},rejections:async()=>{throw Error('No unique selected record');}}};
 const result=await invoke('skills/open-user-goal/reviewRecordedQuestion.nl',services,[
  'const assignment=await discoverRecordedQuestion();const candidates=await findRecordedProposal(assignment,"east-door pilot");const selection=await selectRecordedProposal(assignment,candidates);if(selection.ref)throw Error("This source is ambiguous");return {answer:"Two distinct local proposals share this wording. The record does not establish which applies tonight; identify the intended team before citing either."};',
  'return {ref:null,blocker:"ambiguous"};',
 ],assignment.goal,null);
 expect(result).toEqual({answer:'Two distinct local proposals share this wording. The record does not establish which applies tonight; identify the intended team before citing either.'});expect(searches).toBe(1);
},180000);
it('reaches the declared System client-development hierarchy under the new observation branch without widening authority',async()=>{
 const desk={id:'source-desk',name:'Source Desk',operationId:'source-operation'};let reads=0;const contract={hash:'manifest-bytes',id:'browser',runtime:'web',abi:'web-host-1',required:[],optional:[]};
 const observation={operationId:desk.operationId,contextId:'owned-source-context',source:'clients/desktop-browser',workingRevision:'working',mainRevision:'main',working:contract,published:contract,trusted:true,host:{kind:'desktop',runtimes:{web:'web-host-1'},capabilities:[],deviceLevel:[]},catalog:{status:'ready',source:'clients/desktop-browser',effectiveVersion:'installed-unit-version',activeBuildKey:'actual-build'}};
 const services={desktopReadiness:{discover:async()=>[desk],readWindow:async()=>{throw Error('No layout requested');},readUpdates:async()=>{throw Error('No update requested');}},clientAdmissionRead:{observe:async(id:string)=>{expect(id).toBe(desk.operationId);reads++;return observation;}}};
 const result=await invoke('skills/open-user-goal/reviewDesktopReadiness.nl',services,[
  'const desk=await locateDesktopDesk(goal);const evidence=await inspectDesktopEvidence(goal,desk);return {reason:JSON.stringify(evidence.admission)};',
  'const desks=await desktopReadiness.discover();return desks[0]!;',
  'return {desk,admission:await clientDevelopment.reviewClientAdmission({goal,operationId:desk.operationId}),window:null,updates:null};',
  'const source=await inspectSource(request.operationId);return {source,host:{abi:"compatible",capabilities:{missingRequired:[],untrustedRequired:[],deniedOptional:[]}},decision:"reviewed-ready"};',
  'const observation=await readClient(operationId);return {observation,disposition:observation.working.hash===observation.published.hash?"published-contract":"working-change"};',
 ],'TEST ONLY: inspect the assigned current client declaration and host compatibility, without changing source, trust, build or layout.','inspectDesktopEvidence.nl');
 expect(JSON.parse((result as {reason:string}).reason)).toEqual({source:{observation,disposition:'published-contract'},host:{abi:'compatible',capabilities:{missingRequired:[],untrustedRequired:[],deniedOptional:[]}},decision:'reviewed-ready'});expect(reads).toBe(1);
},180000);
