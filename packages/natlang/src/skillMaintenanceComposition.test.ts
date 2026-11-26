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
const roots=[base,process.env.VIBE_EXAMPLES_TEMPLATE!,process.env.VIBE_SYSTEM_TEMPLATE!,process.env.VIBE_PERSONAL_TEMPLATE!,process.env.VIBE_SYSTEM_TESTING_TEMPLATE!].filter(Boolean);
async function first<T>(op:(root:string)=>Promise<T>){let last;for(const root of roots)try{return await op(root);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;last=error;}throw last;}
async function directory(path:string){const seen=new Map();for(const root of roots)try{for(const entry of await readdir(join(root,path),{withFileTypes:true}))if(!seen.has(entry.name))seen.set(entry.name,entry);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}if(!seen.size)return first(root=>readdir(join(root,path),{withFileTypes:true}));return [...seen.values()];}
async function invoke(path:string,services:object,codes:string[],goal:unknown){
 const methodNames={skillMaintenanceEvidence:['discover','inspect','confirm','readback'],skillMaintenanceEdit:['stage'],authoringCompiler:['inspect']};
 services=Object.fromEntries(Object.entries(services).map(([name,value])=>[name,{...Object.fromEntries((methodNames[name as keyof typeof methodNames]??[]).map(method=>[method,()=>{throw Error('Unrequested Native call '+name+'.'+method);} ])),...value}]));
const owner=new AbortController();let turns=0;const records:{call_id:string;parent_call_id:string|null;definition:{source:string}}[]=[];const {rpc}=fakeRpc({records:{record:input=>{records.push(input.record);return{recordId:input.record.call_id};}},turn:async input=>{const code=codes[turns++];if(!code)throw Error('Unexpected continuation: '+JSON.stringify(input.context.messages.filter(m=>m.role==='toolResult').at(-1)?.content??''));return toolCallMessage('eval',{code,finish:true},{input:0,output:0});}});const runtime=createEvalNatlang({newFunction:testNewFunction(),owner:{kind:'user',objectKey:'TEST-only-workspace-continuity'},bindings:{rpc,fs:{readFile:path=>first(root=>readFile(join(root,path),'utf8')),stat:path=>first(root=>stat(join(root,path))),readdir:directory}}});try{const result=await runtime.runCell(async()=>{const n=runtime.ambient.natlang as {load(p:string,o:object):Promise<unknown>};const f=await n.load(path,{services}) as (value:unknown)=>Promise<unknown>;return Array.isArray(goal)?(f as (...args:unknown[])=>Promise<unknown>)(...goal):f(goal);},{runId:'TEST-only-workspace-continuity',signal:owner.signal});expect(turns).toBe(codes.length);return{value:result.value,records};}finally{owner.abort(new Error("TEST-only owner finished"));runtime.close();}}


const card={id:'owned-skill',label:'Review Board Queue',edition:'working'};
const clause={path:'run/triage/choosePriorities.nl',parameters:['tickets: string[]'],returns:'string[]'};
const opening={path:'skills/queue',revision:'opening',runId:'retained-opening',runDigest:'run-opening',resultDigest:'value-opening',satisfied:false,failures:['return:'+clause.path],expected:[clause],absent:[],requiredSelectors:null};
const actualCurrent={...opening,revision:'after',runId:'retained-current',runDigest:'run-current',resultDigest:'value-current',satisfied:true,failures:[]};
const observation={card,path:'skills/queue',revision:'opening',files:[{path:clause.path,text:'Actual old typed string helper'}],check:opening,editable:[clause.path],approval:'approved',authoringRequest:{goal:'Keep the complete ordered priority queue',compare:false,contract:{entry:clause.path,expectedParameters:clause.parameters,expectedReturn:clause.returns,declaredServices:[],requiredHelpers:[],preserveBaseline:false}}};
const compiler={role:'candidate',revision:'opening',state:'compiled',functions:[{source:clause.path,parameters:clause.parameters,returns:'string'}],services:[],serviceScopes:{}};

it('carries the actual mounted authoring report into a semantic repair and consumes the fresh native check',async()=>{
 let inspected=0,writes=0,readbacks=0;const patch={before:'opening',after:'after',disposition:'staged',paths:[clause.path]};
 const result=await invoke('skills/open-user-goal/maintainWorkspaceSkill.nl',{skillMaintenanceEvidence:{discover:async()=>[card],inspect:async(id:string)=>{expect(id).toBe(card.id);return observation;},confirm:async(id:string,revision:string)=>{expect([id,revision]).toEqual([card.id,'opening']);return{current:'opening',status:'current'};},readback:async(id:string)=>{expect(id).toBe(card.id);readbacks++;return actualCurrent;}},authoringCompiler:{inspect:async(role:string)=>{expect(role).toBe('candidate');inspected++;return compiler;}},skillMaintenanceEdit:{stage:async(id:string,revision:string,changes:{path:string;text:string}[])=>{expect([id,revision]).toEqual([card.id,'opening']);expect(changes).toHaveLength(1);expect(changes[0]!.path).toBe(clause.path);expect(changes[0]!.text).toContain('Return every priority label in original order');writes++;return patch;}}},[
 'const card=await locateMaintenanceSkill(goal);const inquiry=await investigateSkill(goal,card);const gate=await confirmSkillFrontier(card,inquiry.observation.revision);const intent=await decideSkillMaintenance(goal,inquiry,gate);if(inquiry.authoring===null)throw Error("Missing semantic authoring report");if(intent.action!=="stage-local-patch")throw Error("Report not consumed");const patch=await prepareSkillRepair(goal,inquiry);const check=await checkSkillReadback(card);return {explanation:check.satisfied?"The current ordered-list check now passes; semantic recovery: "+inquiry.authoring.findings[0].recovery:"The native check still fails.",patch,check};',
 'return (await skillMaintenanceEvidence.discover()).find(row=>row.edition==="working");',
 'const observation=await inspectMaintenanceEvidence(card);return {card,observation,authoring:await authoring.reviewProgram(observation.authoringRequest)};',
 'return readScopedSkill(card.id);',
 'const revisions=await inspectRevisions(request.compare);if(revisions.candidate.state!=="compiled")throw Error("Not compiled");const findings=await reviewContract(request.contract,revisions.candidate,null);return {status:findings.length?"changes-required":"ready",candidateRevision:revisions.candidate.revision,baselineRevision:null,findings};',
 'return {candidate:await readAssignedProgram("candidate"),baseline:null};',
 'return [...await checkSignature(contract,candidate.functions,[]),...await checkAuthority(contract,candidate,null),...await checkTopology(contract.requiredHelpers,candidate.functions)];',
 'const found=candidate.find(row=>row.source===contract.entry);if(!found)throw Error("Missing actual entry");return found.returns===contract.expectedReturn?[]:[{code:"return-change",subject:found.source,observed:found.returns,recovery:"Return every priority label in original order, not one label."}];',
 'return [];',
 'return [];',
 'if(inquiry.authoring===null||inquiry.authoring.status!=="changes-required"||inquiry.authoring.findings[0].observed!=="string")throw Error("Lost actual semantic report");return {action:"stage-local-patch",reason:inquiry.authoring.findings[0].recovery};',
 'const changes=await draftSkillChanges(goal,inquiry);return stageSkillChanges(inquiry.card.id,inquiry.observation.revision,changes);',
 'if(inquiry.authoring===null)throw Error("Missing semantic authoring report");const finding=inquiry.authoring.findings[0];return [{path:finding.subject,text:["---","description: Return the ordered queue.","args:","  tickets: string[]","returns: string[]","---",finding.recovery].join(String.fromCharCode(10))}];'
 ],'The retained trial expects the complete ordered queue. Repair only that current helper and confirm the actual result.');
 expect([inspected,writes,readbacks]).toEqual([1,1,1]);expect(result.value).toEqual({explanation:expect.stringContaining('semantic recovery: Return every priority'),patch,check:actualCurrent});expect(result.records.some(r=>r.definition.source.endsWith('reviewProgram.nl'))).toBe(true);expect(result.records.some(r=>r.definition.source.endsWith('inspectRevisions.nl'))).toBe(true);expect(result.records.some(r=>r.definition.source.endsWith('draftSkillChanges.nl'))).toBe(true);
},240000);
it('uses a current native readback for an archive-versus-current question without acquiring edit authority or inventing a report',async()=>{
 const old={...observation,check:{...opening,path:'skills/queue-archive',revision:'archive'},approval:'denied'};let reads=0;
 const result=await invoke('skills/open-user-goal/maintainWorkspaceSkill.nl',{skillMaintenanceEvidence:{discover:async()=>[card],inspect:async()=>old,readback:async()=>{reads++;return actualCurrent;}},authoringCompiler:{},skillMaintenanceEdit:{}},[
 'const card=await locateMaintenanceSkill(goal);const inquiry=await investigateSkill(goal,card);const check=await checkSkillReadback(card);return {explanation:check.satisfied?"The old failing witness belongs to the archive; the current working check passes. No edit was made.":"The current working check still fails.",patch:null,check};',
 'return (await skillMaintenanceEvidence.discover()).find(row=>row.edition==="working");',
 'return {card,observation:await inspectMaintenanceEvidence(card),authoring:null};',
 'return readScopedSkill(card.id);'
 ],'That old helper check may belong to the archive. Tell me whether the current working contract passes; inspect only.');expect(reads).toBe(1);expect(result.value).toEqual({explanation:expect.stringContaining('current working check passes'),patch:null,check:actualCurrent});
},240000);
