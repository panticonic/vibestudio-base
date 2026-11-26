/** TEST ONLY: real public loader/evaluator with scripted semantic choices and exact Native callbacks; no provider calls. */
import {expect,it} from 'vitest';
import {createHash} from 'node:crypto';
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
async function invoke(path:string,services:object,codes:string[],goal:unknown){let turns=0;const records:{call_id:string;parent_call_id:string|null;definition:{source:string}}[]=[];const {rpc}=fakeRpc({records:{record:input=>{records.push(input.record);return{recordId:input.record.call_id};}},turn:async input=>{const code=codes[turns++];if(!code)throw Error('Unexpected continuation: '+JSON.stringify(input.context.messages.filter(m=>m.role==='toolResult').at(-1)?.content??''));return toolCallMessage('eval',{code,finish:true},{input:0,output:0});}});const runtime=createEvalNatlang({newFunction:testNewFunction(),owner:{kind:'user',objectKey:'TEST-only-workspace-continuity'},bindings:{rpc,fs:{readFile:path=>first(root=>readFile(join(root,path),'utf8')),stat:path=>first(root=>stat(join(root,path))),readdir:directory}}});try{const result=await runtime.runCell(async()=>{const n=runtime.ambient.natlang as {load(p:string,o:object):Promise<unknown>};const f=await n.load(path,{services}) as (value:unknown)=>Promise<unknown>;return Array.isArray(goal)?(f as (...args:unknown[])=>Promise<unknown>)(...goal):f(goal);},{runId:'TEST-only-workspace-continuity',signal:new AbortController().signal});expect(turns).toBe(codes.length);return{value:result.value,records};}finally{runtime.close();}}


it('composes actual retained output inspection under read-only authority without continuation',async()=>{
 const card={id:'owned-action',notebook:'owned-notebook',revision:'owned-current',title:'Permit notebook'};
 const goal='Reconcile this permit notebook retained output with the current action. Read-only; do not continue.';
 const assignment={notebook:card.notebook,title:card.title,revision:card.revision,goal,task:'continue',approval:{notebook:card.notebook,revision:card.revision,mode:'read-only'},attempts:[card]};
 const content='Retained permit output 🖨; approved route uses the east desk.',digest=createHash('sha256').update(content).digest('hex');
 const evidence={attempt:card,runId:'actual-run',runDigest:'native-run-digest',resultDigest:'native-result-digest',terminal:'returned',admitted:true,completeEvents:true,lastSequence:3,invocationStatus:'succeeded',failure:null,console:{lines:0,tail:null,complete:true,sha256:'empty-console'},notebook:{revision:card.revision,saved:true,ready:true,settledDigest:digest,siblingKeys:['protected-sibling']},exactRetry:false};
 const values=[{attempt:card,runId:evidence.runId,revision:card.revision,key:'ownedLargeResult',content,digest,observedAfterContinuation:null}];let reads=0;
 const result=await invoke('skills/open-user-goal/recoverAgentCapability.nl',{agentCapabilityEvidence:{discover:async()=>assignment,inspect:async(id:string)=>{expect(id).toBe(card.id);return evidence;},readRetainedValues:async(id:string,resultDigest:string,revision:string)=>{expect([id,resultDigest,revision]).toEqual([card.id,evidence.resultDigest,card.revision]);reads++;return values;}},agentCapabilityContinue:{apply:async()=>{throw Error('A read-only inspection has no continuation grant');}}},[
 'const inquiry=await investigateCapabilityRecovery(goal);if(!inquiry.evidence)throw Error("No inspected owner basis");const values=await readRequestedOutput(goal,inquiry.evidence.current);if(!values)throw Error("The inspected read basis is no longer current");return applicationResult("The exact current action retains this actual output; inspection did not authorize or perform continuation.",null,values);',
 'const assignment=await discoverAttempts();const evidence=await inspectAttempt(assignment,goal);const finding=await decideContinuation(assignment,evidence);return {assignment,evidence,finding};',
 'const card=assignment.attempts.find(row=>row.notebook===assignment.notebook&&row.revision===assignment.revision);if(!card)throw Error("No exact current owner");return {current:await readNativeAttempt(card.id),prior:null};',
 'if(assignment.approval.mode!=="read-only")throw Error("Unexpected operation grant");return {decision:"inspect-only",reason:"Actual retained output can be read without another action."};',
 'return readOwnedValues(evidence);'
 ],goal);expect(reads).toBe(1);expect(result.value).toEqual({explanation:'The exact current action retains this actual output; inspection did not authorize or perform continuation.',continuation:null,retainedValues:values});expect(result.records.some(r=>r.definition.source.endsWith('readRequestedOutput.nl'))).toBe(true);
},240000);
