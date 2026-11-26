/** TEST ONLY: real public loader/evaluator with scripted semantic choices and exact Native callbacks; no provider calls. */
import {expect,it} from 'vitest';
import {readFile,readdir,stat,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createEvalNatlang} from './index.js';
import {compileProgram,readProjectFiles} from './programs.js';
import {confinedRealm} from './realm.js';
import {workerdPlatform} from '../vendor/workerd/natlang-workerd.js';
import {fakeRpc,testNewFunction,toolCallMessage} from './testSupport.js';
const base=fileURLToPath(new URL('../../..',import.meta.url));
const roots=[base,process.env.VIBE_EXAMPLES_TEMPLATE!,process.env.VIBE_SYSTEM_TEMPLATE!,process.env.VIBE_PERSONAL_TEMPLATE!].filter(Boolean);
async function first<T>(op:(root:string)=>Promise<T>){let last;for(const root of roots)try{return await op(root);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;last=error;}throw last;}
async function directory(path:string){const seen=new Map();for(const root of roots)try{for(const entry of await readdir(join(root,path),{withFileTypes:true}))if(!seen.has(entry.name))seen.set(entry.name,entry);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}if(!seen.size)return first(root=>readdir(join(root,path),{withFileTypes:true}));return [...seen.values()];}
async function invoke(path:string,services:object,codes:string[],goal:unknown){let turns=0;const records:{call_id:string;parent_call_id:string|null;definition:{source:string}}[]=[];const {rpc}=fakeRpc({records:{record:input=>{records.push(input.record);return{recordId:input.record.call_id};}},turn:async input=>{const code=codes[turns++];if(!code)throw Error('Unexpected continuation: '+JSON.stringify(input.context.messages.filter(m=>m.role==='toolResult').at(-1)?.content??''));return toolCallMessage('eval',{code,finish:true},{input:0,output:0});}});const runtime=createEvalNatlang({newFunction:testNewFunction(),owner:{kind:'user',objectKey:'TEST-only-domain-composition'},bindings:{rpc,fs:{readFile:path=>first(root=>readFile(join(root,path),'utf8')),stat:path=>first(root=>stat(join(root,path))),readdir:directory}}});try{const result=await runtime.runCell(async()=>{const n=runtime.ambient.natlang as {load(p:string,o:object):Promise<unknown>};const f=await n.load(path,{services}) as (value:unknown)=>Promise<unknown>;return Array.isArray(goal)?(f as (...args:unknown[])=>Promise<unknown>)(...goal):f(goal);},{runId:'TEST-only-domain-composition',signal:new AbortController().signal});expect(turns).toBe(codes.length);return{value:result.value,records};}finally{runtime.close();}}

const audienceRecord={id:'owned-sheet',revision:'revision-2',title:'Budget choices',source:'owned-source',facts:[{id:'fare',value:'12 EUR'}],sections:[{id:'budget',required:true,ask:'Explore the fare',data:'12 EUR'}],model:{id:'bounded-fare',title:'Trip fare',inputLabel:'Trips',outputLabel:'Fare',baseCents:0,unitCents:1200,divisor:1,initial:1,min:0,max:5}};
it('delegates an audience inquiry without manufacturing a visual for a plain answer',async()=>{
 let reads=0;const result=await invoke('skills/open-user-goal/chooseAudienceResponse.nl',{nativeAudienceResponse:{readRecord:async()=>{reads++;return audienceRecord;},render:async()=>{throw Error('No visual was requested');}}},[
 'const need=await reviewAudienceNeed(goal);const answer=await answerFromRecord(goal,need.record,need.choice);return applicationResult(answer,null);',
 'const record=await readAudienceRecord();const choice=await decideAudienceFormat(goal,record);return {record,choice};',
 'return {mode:"plain",reason:"The user asks one exact fare in text."};',
 'return {facts:[record.facts[0]],text:"The fare is 12 EUR."};'
 ],'Tell me the exact fare in text only.');expect(reads).toBe(1);expect(result.value).toEqual({answer:{facts:[{id:'fare',value:'12 EUR'}],text:'The fare is 12 EUR.'},receipt:null});expect(result.records.some(r=>r.definition.source.endsWith('reviewAudienceNeed/decideAudienceFormat.nl'))).toBe(true);
},240000);
it('composes the installed visualization hierarchy and preserves its exact native render receipt',async()=>{
 const receipt={revision:'revision-2',ids:['budget'],mdxDigests:['native-mdx'],interaction:{inputLabel:'Trips',beforeInput:1,afterInput:2,beforeResult:'12 EUR',afterResult:'24 EUR'}};let renders=0;
 const result=await invoke('skills/open-user-goal/chooseAudienceResponse.nl',{nativeAudienceResponse:{readRecord:async()=>audienceRecord,render:async(id:string,revision:string,prepared:any)=>{expect(id).toBe(audienceRecord.id);expect(revision).toBe(audienceRecord.revision);expect(prepared).toEqual({presentation:{views:[{id:'budget',status:'deferred',component:'Calculator'}],omitted:[]},modelId:'bounded-fare'});renders++;return receipt;}}},[
 'const need=await reviewAudienceNeed(goal);const prepared=await prepareAudienceVisual(goal,need.record,need.choice);const receipt=await workspace.renderAudienceVisual(need.record.id,need.record.revision,prepared);const answer=await answerFromRecord(goal,need.record,need.choice);return applicationResult(answer,receipt);',
 'const record=await readAudienceRecord();const choice=await decideAudienceFormat(goal,record);return {record,choice};',
 'return {mode:"calculator",reason:"The user needs to vary the recorded bounded trip input."};',
 'const presentation=await visualize.preparePresentation({goal,sections:record.sections});return {presentation,modelId:record.model?record.model.id:null};',
 'return {views:[{id:request.sections[0].id,status:"deferred",component:"Calculator"}],omitted:[]};',
 'return {facts:[record.facts[0]],text:"The exact fare is 12 EUR per trip; the view varies the recorded trip input."};'
 ],'Let me vary trips and see the fare, and include the exact rate.');expect(renders).toBe(1);expect((result.value as any).receipt).toEqual(receipt);expect(result.records.some(r=>r.definition.source.includes('prepareAudienceVisual/visualize/preparePresentation.nl'))).toBe(true);
},240000);
const shareCard={id:'current-document',workspace:'current-workspace',title:'Same title',revision:'edition-2'};
const shareObservation={object:{...shareCard,author:'current-user',digest:'current-body'},session:{admitted:true,accountRole:'member'},member:{accountRole:'member',workspaceRole:'member',active:true,revoked:false},invitation:{user:'current-user',channel:'current-channel',revision:2,currentRevision:2,member:true,action:'put',inbox:'acknowledged',exact:true},approval:{workspace:shareCard.workspace,document:shareCard.id,revision:shareCard.revision,digest:'current-body',recipient:'current-user',invitationRevision:2,role:'reviewer',status:'approved'}};
it.each([false,true])('does not equate permission with a requested sharing write (requested=%s)',async requested=>{
 const goal=requested?'Check the exact review scope and save a private handoff.':'Only explain my current review scope. Do not create a note.';let writes=0;const receipt={path:'/.tmp/owned-note/handoff.json',bytes:20,sha256:'native-hash'};
 const assignment={goal,workspace:shareCard.workspace,document:shareCard.id,user:'current-user',purpose:'review-note',candidates:[shareCard]};
 const result=await invoke('skills/open-user-goal/reviewWorkspaceShare.nl',{workspaceShareEvidence:{discover:async()=>assignment,inspect:async(id:string)=>{expect(id).toBe(shareCard.id);return shareObservation;}},workspaceShareHandoff:{stage:async(observation:unknown,decision:string)=>{expect(observation).toEqual(shareObservation);expect(decision).toBe('stage-reviewer');writes++;return receipt;}}},[
 'const assignment=await discoverShare();const observation=await identifyShare(goal,assignment);const finding=await reviewSharePolicy(assignment,observation);'+(requested?'const handoff=await stageShare(observation,finding.decision);return {finding,handoff};':'return {finding,handoff:null};'),
 'return readShare(assignment.document);',
 'return {decision:"stage-reviewer",reason:"The exact current reviewer grant permits this private note scope."};'
 ],goal);expect(writes).toBe(requested?1:0);expect((result.value as any).handoff).toEqual(requested?receipt:null);expect(result.records.some(r=>r.definition.source.endsWith('reviewWorkspaceShare.nl'))).toBe(true);
},240000);
it('preserves a diagnostic boundary and does not invent a runtime profile or write',async()=>{
 let writes=0;const result=await invoke('skills/open-user-goal/reviewRetainedBuildIncident.nl',{buildIncidentCatalog:{discover:async()=>({subject:{title:'Runtime question',source:'workers/owned',owner:'current-owner',revision:'current-revision'},checkpoints:[],budgetBytes:null,localHandoffAllowed:true}),open:async()=>{throw Error('No retained checkpoint exists');}},buildIncidentHandoff:{stage:async()=>{writes++;throw Error('No handoff requested');}}},[
 'const survey=await discoverIncident();const selected=await selectCheckpoints(goal,survey);const disposition=await decideFinding(goal,selected.focus,null,null);return {current:null,baseline:null,disposition,handoff:null};',
 'return {focus:"runtime-memory",current:null,baseline:null};',
 'return {finding:"held",blocker:"wrong-measurement-boundary",reason:"No retained process-tree memory observation exists; a build would not establish runtime memory."};'
 ],'Explain whether these build logs establish runtime memory. Do not save anything.');expect(writes).toBe(0);expect(result.value).toMatchObject({current:null,baseline:null,handoff:null,disposition:{finding:'held',blocker:'wrong-measurement-boundary'}});
},240000);
