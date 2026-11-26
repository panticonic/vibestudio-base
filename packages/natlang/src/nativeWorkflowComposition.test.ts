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
async function invoke(path:string,services:object,codes:string[],goal:unknown){let turns=0;const records:{call_id:string;parent_call_id:string|null;definition:{source:string}}[]=[];const {rpc}=fakeRpc({records:{record:input=>{records.push(input.record);return{recordId:input.record.call_id};}},turn:async input=>{const code=codes[turns++];if(!code)throw Error('Unexpected continuation: '+JSON.stringify(input.context.messages.filter(m=>m.role==='toolResult').at(-1)?.content??''));return toolCallMessage('eval',{code,finish:true},{input:0,output:0});}});const runtime=createEvalNatlang({newFunction:testNewFunction(),owner:{kind:'user',objectKey:'TEST-only-workspace-continuity'},bindings:{rpc,fs:{readFile:path=>first(root=>readFile(join(root,path),'utf8')),stat:path=>first(root=>stat(join(root,path))),readdir:directory}}});try{const result=await runtime.runCell(async()=>{const n=runtime.ambient.natlang as {load(p:string,o:object):Promise<unknown>};const f=await n.load(path,{services}) as (value:unknown)=>Promise<unknown>;return Array.isArray(goal)?(f as (...args:unknown[])=>Promise<unknown>)(...goal):f(goal);},{runId:'TEST-only-workspace-continuity',signal:new AbortController().signal});expect(turns).toBe(codes.length);return{value:result.value,records};}finally{runtime.close();}}


it('owns the exact release investigation hierarchy and answers without an unrequested dossier attempt',async()=>{
 const goal='Explain what the current Speech candidate still needs. Read-only; no retained note.';
 const request={goal,operationId:'owned-release',method:'status'};
 const assignment={request,owner:{name:'@workspace-extensions/speech',source:'extensions/speech',candidateTree:'current-tree',grant:'inspect',retainedBuild:null},purpose:'verification'};
 const source={operationId:request.operationId,contextId:'owned',name:assignment.owner.name,source:assignment.owner.source,workingRevision:'working',mainRevision:'main',working:{hash:'working-manifest',activation:'on-invoke',methods:['status']},published:{hash:'published-manifest',activation:'on-invoke',methods:['status']},workingTree:'current-tree',publishedTree:'protected-tree'};
 const runtime={operationId:request.operationId,name:assignment.owner.name,source:assignment.owner.source,status:'available',activeEv:null,identity:null,methods:[],pendingApproval:null,hasError:false,dependencyUpdate:false};
 const delta={workingDigest:source.working.hash,publishedDigest:source.published.hash,candidateValidationError:null,activation:{working:['onInvoke'],published:['onInvoke']},dependencyChanges:[],methodChanges:[],capabilityChanges:[],expandedCapabilities:false};
 const history={current:null,previous:[],retentionLimit:3,requested:null,requestedBuildVerified:false,receiverMatches:true};const calls:string[]=[];
 const result=await invoke('skills/open-user-goal/reviewExtensionDossier.nl',{extensionDossierRead:{discover:async()=>assignment,candidate:async(id:string)=>{expect(id).toBe(request.operationId);calls.push('candidate');return delta;},history:async(id:string)=>{expect(id).toBe(request.operationId);calls.push('history');return history;}},extensionReleaseRead:{source:async(id:string)=>{expect(id).toBe(request.operationId);calls.push('source');return source;},runtime:async(id:string)=>{expect(id).toBe(request.operationId);calls.push('runtime');return runtime;}},extensionDossierWrite:{stage:async()=>{throw Error('Read-only goal does not request a note');}}},[
 'const inquiry=await investigateDossier(goal);if(inquiry.review.source.observation.workingTree!==inquiry.assignment.owner.candidateTree)throw Error("No exact current scope");return applicationResult("The working candidate differs from protected source and still needs verification. The currently cold runtime does not show it running. No note or release was changed.",null);',
 'const assignment=await discoverDossier();const review=await extensiondev.reviewExtensionRelease(assignment.request);const candidate=await compareCandidate(review);const history=await inspectRelease(assignment,review);const finding=await decideDossier(assignment,review,candidate,history);return {assignment,review,candidate,history,finding};',
 'const source=await reviewSource(request.operationId,request.method);const runtime=await reviewRuntime(request.operationId,request.method);return {source,runtime,decision:await chooseNext(source,runtime)};',
 'return {observation:await readSource(operationId),disposition:"unpublished-candidate"};',
 'return {observation:await readRuntime(operationId),disposition:"cold"};',
 'return "verify-and-publish-candidate";',
 'return {delta:await readCandidate(review.source.observation.operationId),compatibility:"verification-needed"};',
 'return readHistory(assignment.request.operationId);',
 'if(assignment.owner.grant!=="inspect"||candidate.compatibility!=="verification-needed")throw Error("Lost actual native review");return {decision:"verify-local-candidate",reason:"A differing working tree still needs verification; inspect scope does not permit a retained note."};'
 ],goal);expect(calls.sort()).toEqual(['candidate','history','runtime','source']);expect(result.value).toMatchObject({dossier:null,explanation:expect.stringContaining('still needs verification')});const root=result.records.find(r=>r.parent_call_id===null&&r.definition.source.endsWith('reviewExtensionDossier.nl'));expect(root).toBeDefined();expect(result.records.some(r=>r.parent_call_id===root!.call_id&&r.definition.source.endsWith('investigateDossier.nl'))).toBe(true);
},240000);
