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
 const methodNames={operationsDocket:['list','read'],ownedOperations:['open','append','read','restart','close'],operationsDossier:['retain']};
 services=Object.fromEntries(Object.entries(services).map(([name,value])=>[name,{...Object.fromEntries((methodNames[name as keyof typeof methodNames]??[]).map(method=>[method,()=>{throw Error('Unrequested Native call '+name+'.'+method);} ])),...value}]));
const owner=new AbortController();let turns=0;const records:{call_id:string;parent_call_id:string|null;definition:{source:string}}[]=[];const {rpc}=fakeRpc({records:{record:input=>{records.push(input.record);return{recordId:input.record.call_id};}},turn:async input=>{const code=codes[turns++];if(!code)throw Error('Unexpected continuation: '+JSON.stringify(input.context.messages.filter(m=>m.role==='toolResult').at(-1)?.content??''));return toolCallMessage('eval',{code,finish:true},{input:0,output:0});}});const runtime=createEvalNatlang({newFunction:testNewFunction(),owner:{kind:'user',objectKey:'TEST-only-owned-operations'},bindings:{rpc,fs:{readFile:path=>first(root=>readFile(join(root,path),'utf8')),stat:path=>first(root=>stat(join(root,path))),readdir:directory}}});try{const result=await runtime.runCell(async()=>{const n=runtime.ambient.natlang as {load(p:string,o:object):Promise<unknown>};const f=await n.load(path,{services}) as (value:unknown)=>Promise<unknown>;return Array.isArray(goal)?(f as (...args:unknown[])=>Promise<unknown>)(...goal):f(goal);},{runId:'TEST-only-owned-operations',signal:owner.signal});expect(turns).toBe(codes.length);return{value:result.value,records};}finally{owner.abort(new Error("TEST-only owner finished"));await runtime.close();}}

const docket={id:'actual-owned-docket',title:'Printer routing',revision:'native-source-revision',kind:'release-continuation',edition:'current'};
const before=[{id:'queue-probe',state:'pending'},{id:'location-owner',state:'approved'}],after=before.map(row=>({...row,state:'approved'}));
function nativePorts(refuse=false){
 const handle={id:'issued-worker',contextId:'issued-context',targetId:'actual-rpc-target',role:'release'};let opened=0,restarts=0,closed=0,writes=0,state={revision:0,checkpoints:[] as any[]};
 const evidence={docket,authority:'local-exercise',rationale:'The current owner permits this isolated local exercise.',retainWhenReady:true,request:{kind:'release-continuation',goal:'Current owned release exercise',before,after}};
 const receipt={path:'/.tmp/actual-issued-dossier.json',digest:'actual-native-issued-digest'};
 return{handle,evidence,receipt,counts:()=>({opened,restarts,closed,writes}),services:{
  operationsDocket:{list:async()=>[{...docket,id:'retired',edition:'retired'},docket],read:async(id:string,revision:string)=>{expect([id,revision]).toEqual([docket.id,docket.revision]);return evidence;}},
  ownedOperations:{open:async(role:string)=>{expect(role).toBe('release');opened++;return handle;},append:async(got:unknown,revision:number,assessment:any)=>{expect(got).toEqual(handle);expect(revision).toBe(state.revision);state={revision:revision+1,checkpoints:[...state.checkpoints,{revision:revision+1,assessment}]};return structuredClone(state);},read:async(got:unknown)=>{expect(got).toEqual(handle);return structuredClone(state);},restart:async(got:unknown)=>{expect(got).toEqual(handle);restarts++;return structuredClone(state);},close:async()=>{closed++;return{retiredIds:[handle.id],destroyedContextIds:[handle.contextId]};}},
  operationsDossier:{retain:async(id:string,revision:string,report:any)=>{expect([id,revision]).toEqual([docket.id,docket.revision]);expect(report.handles).toEqual([handle]);expect(report.cleanup.retiredIds).toEqual([handle.id]);expect(report.handoff.decision).toBe('ready');expect(state.revision).toBe(2);writes++;if(refuse)throw Error('Native retention authority changed');return receipt;}},
 }};
}
const choose='const rows=await operationsDocket.list();const docket=rows.find(row=>row.edition==="current");if(!docket)return null;return operationsDocket.read(docket.id,docket.revision);';
const investigate='if(evidence.authority!=="local-exercise"||evidence.request.kind!=="release-continuation")throw Error("Wrong actual scope");const assessed=await roles.release(goal,evidence.request.before,evidence.request.after);const operation=await completeOperation(evidence.request.kind,assessed);return {operation,finding:operation.handoff.summary};';
const release='const handle=await ownedOperations.open("release");const original=await assessGate(goal,before);const stored=await ownedOperations.append(handle,0,original);const restored=await ownedOperations.restart(handle);if(JSON.stringify(stored)!==JSON.stringify(restored))throw Error("Actual continuity failed");const current=await assessGate(goal,after);await ownedOperations.append(handle,restored.revision,current);const readback=await ownedOperations.read(handle);const conclusion=await handoff(goal,readback.checkpoints);return {handoff:conclusion,handles:[handle]};';
const assess='const decision=gates.length>0&&gates.every(row=>row.state==="approved")?"ready":"blocked";return {role:"release",decision,evidenceIds:gates.map(row=>row.id),reason:decision==="ready"?"Every actual current gate is approved":"The actual prior queue probe remains pending"};';
const handoff='const current=checkpoints.at(-1);if(!current)throw Error("Missing persisted checkpoint");return {decision:current.assessment.decision,evidenceIds:current.assessment.evidenceIds,summary:"The stored prior state was "+checkpoints[0].assessment.decision+"; the actual current state is "+current.assessment.decision+" after restart and fresh readback."};';
it('composes actual mounted release skills, checkpoint continuity, cleanup and retained dossier through the public hierarchy',async()=>{
 const ports=nativePorts();const result=await invoke('skills/open-user-goal/coordinateOwnedOperations.nl',ports.services,[
 'const evidence=await selectOperationsDocket(goal);if(!evidence)throw Error("No owned docket");const investigation=await investigateOperations(goal,evidence,null);if(!investigation.operation)throw Error("No actual operation");const dossier=await retainOperationsDossier(evidence.docket,investigation.operation);return explainOperationsFinding(goal,evidence,investigation,dossier);',
 choose,investigate,release,assess,assess,handoff,
 'if(!investigation?.operation||!dossier)throw Error("Missing actual result");return investigation.finding+" Actual private dossier: "+dossier.path;'
 ],'Take the owned Printer routing review through its real restart, tell me what changed, and retain the private dossier if current approvals permit.');
 expect(ports.counts()).toEqual({opened:1,restarts:1,closed:1,writes:1});expect(result.value).toContain('prior state was blocked');expect(result.value).toContain(ports.receipt.path);
 expect(result.records.some(row=>row.definition.source.endsWith('investigateOperations.nl'))).toBe(true);expect(result.records.some(row=>row.definition.source.endsWith('release.nl'))).toBe(true);expect(result.records.some(row=>row.definition.source.endsWith('assessGate.nl'))).toBe(true);
},240000);
it('answers actual review-only authority without a forced checkpoint exercise, cleanup or dossier route',async()=>{
 const evidence={docket,authority:'review-only',rationale:'The actual current owner permits reading only; no checkpoint or dossier operation is authorized.',retainWhenReady:false,request:{kind:'release-continuation',goal:'Current authority',before,after}};
 const result=await invoke('skills/open-user-goal/coordinateOwnedOperations.nl',{operationsDocket:{list:async()=>[docket],read:async()=>evidence}},[
 'const evidence=await selectOperationsDocket(goal);if(!evidence)return "No current docket";const investigation=await investigateOperations(goal,evidence,null);return investigation.finding;',
 choose,'return {operation:null,finding:evidence.rationale};'
 ],'Tell me what the local owner currently permits before I ask anyone to continue the checkpoint or retain a dossier.');
 expect(result.value).toContain('reading only');expect(result.records.some(row=>row.definition.source.endsWith('release.nl'))).toBe(false);
},240000);
it('keeps actual native refusal feedback and does not claim a dossier when later authority rejects retention',async()=>{
 const ports=nativePorts(true);const result=await invoke('skills/open-user-goal/coordinateOwnedOperations.nl',ports.services,[
 'const evidence=await selectOperationsDocket(goal);if(!evidence)throw Error("No current docket");const investigation=await investigateOperations(goal,evidence,null);if(!investigation.operation)throw Error("No actual exercise");let dossier=null,feedback=investigation;try{dossier=await retainOperationsDossier(evidence.docket,investigation.operation);}catch(error){feedback={...investigation,finding:investigation.finding+" Native retention refused: "+String(error)};}return explainOperationsFinding(goal,evidence,feedback,dossier);',
 choose,investigate,release,assess,assess,handoff,
 'if(dossier!==null||!investigation?.finding.includes("Native retention authority changed"))throw Error("Actual refusal was discarded");return investigation.finding+" No private dossier was retained.";'
 ],'Run the local review and tell me its actual current result. Retain a private dossier only while the real native authority still permits it.');
 expect(ports.counts()).toEqual({opened:1,restarts:1,closed:1,writes:1});expect(result.value).toContain('No private dossier was retained');
},240000);
