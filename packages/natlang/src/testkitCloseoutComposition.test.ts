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
 const methodNames={unitHandoff:['discover','begin','lifecycle'],unitIdentity:['observe','resolve','stage']};
 services=Object.fromEntries(Object.entries(services).map(([name,value])=>[name,{...Object.fromEntries((methodNames[name as keyof typeof methodNames]??[]).map(method=>[method,()=>{throw Error('Unrequested Native call '+name+'.'+method);} ])),...value}]));
let turns=0;const records:{call_id:string;parent_call_id:string|null;definition:{source:string}}[]=[];const {rpc}=fakeRpc({records:{record:input=>{records.push(input.record);return{recordId:input.record.call_id};}},turn:async input=>{const code=codes[turns++];if(!code)throw Error('Unexpected continuation: '+JSON.stringify(input.context.messages.filter(m=>m.role==='toolResult').at(-1)?.content??''));return toolCallMessage('eval',{code,finish:true},{input:0,output:0});}});const runtime=createEvalNatlang({newFunction:testNewFunction(),owner:{kind:'user',objectKey:'TEST-only-workspace-continuity'},bindings:{rpc,fs:{readFile:path=>first(root=>readFile(join(root,path),'utf8')),stat:path=>first(root=>stat(join(root,path))),readdir:directory}}});try{const result=await runtime.runCell(async()=>{const n=runtime.ambient.natlang as {load(p:string,o:object):Promise<unknown>};const f=await n.load(path,{services}) as (value:unknown)=>Promise<unknown>;return Array.isArray(goal)?(f as (...args:unknown[])=>Promise<unknown>)(...goal):f(goal);},{runId:'TEST-only-workspace-continuity',signal:new AbortController().signal});expect(turns).toBe(codes.length);return{value:result.value,records};}finally{runtime.close();}}


it('composes actual current cleanup evidence without forcing a prior read or permission-only private note',async()=>{
 const pair={current:{label:'current Testkit attempt',receipt:'owned-current'},prior:{label:'prior Testkit attempt',receipt:'owned-prior'}},resource={id:'/.tmp/unregistered-body',kind:'scratch'};
 const evidence={receipt:pair.current.receipt,outcome:'passed',error:null,logs:[],acquired:[resource],release:{kind:'testkit',receipt:'owned-current:deferred',resources:[],released:[]},remaining:[resource],protectedUnchanged:true};let reads=0;
 const result=await invoke('skills/open-user-goal/compareTestkitCloseouts.nl',{testkitCloseout:{nominate:async()=>pair,stage:async()=>{throw Error('Permission did not request a private file');}},testkitCleanup:{inspect:async(receipt:string)=>{expect(receipt).toBe(pair.current.receipt);reads++;return evidence;}}},[
 'const inquiry=await investigateCloseout(goal);return {decision:await decideCloseout(goal,inquiry.pair,inquiry.current,inquiry.prior),handoff:null};',
 'const pair=await discoverCloseoutAttempts(goal);return {pair,current:await readAttempt(goal,pair.current),prior:null};',
 'return session.reviewLiveCleanup({goal,receipt:attempt.receipt});',
 'const evidence=await readCleanup(request.receipt);return {receipt:evidence.receipt,testOutcome:await readOutcome(evidence),release:{decision:"revise",finding:"An unregistered directory survives",evidenceIds:[evidence.release.receipt]},inventory:"unregistered-residue",remainingIds:evidence.remaining.map(row=>row.id)};',
 'return evidence.outcome;',
 'if(prior!==null||current.inventory!=="unregistered-residue")throw Error("No actual current survivor");return {status:"hold-residue",currentRemaining:current.remainingIds,note:false,explanation:"The body directory was never registered for deferred cleanup; it remains, rather than a registered callback missing its removal. No deletion, rerun or optional private file was performed."};'
 ],'Distinguish an unregistered body directory from a missed teardown. We can retain a private warning, but do not delete or rerun.');expect(reads).toBe(1);expect(result.value).toMatchObject({decision:{note:false,currentRemaining:[resource.id]},handoff:null});expect(result.records.some(r=>r.definition.source.endsWith('investigateCloseout.nl'))).toBe(true);expect(result.records.some(r=>r.definition.source.endsWith('reviewLiveCleanup.nl'))).toBe(true);
},240000);
