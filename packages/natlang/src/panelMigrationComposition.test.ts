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
 const methodNames={panelMigrationEvidence:['discover','inspect'],panelMigrationChange:['move','align','update']};
 services=Object.fromEntries(Object.entries(services).map(([name,value])=>[name,{...Object.fromEntries((methodNames[name as keyof typeof methodNames]??[]).map(method=>[method,()=>{throw Error('Unrequested Native call '+name+'.'+method);} ])),...value}]));
let turns=0;const records:{call_id:string;parent_call_id:string|null;definition:{source:string}}[]=[];const {rpc}=fakeRpc({records:{record:input=>{records.push(input.record);return{recordId:input.record.call_id};}},turn:async input=>{const code=codes[turns++];if(!code)throw Error('Unexpected continuation: '+JSON.stringify(input.context.messages.filter(m=>m.role==='toolResult').at(-1)?.content??''));return toolCallMessage('eval',{code,finish:true},{input:0,output:0});}});const runtime=createEvalNatlang({newFunction:testNewFunction(),owner:{kind:'user',objectKey:'TEST-only-workspace-continuity'},bindings:{rpc,fs:{readFile:path=>first(root=>readFile(join(root,path),'utf8')),stat:path=>first(root=>stat(join(root,path))),readdir:directory}}});try{const result=await runtime.runCell(async()=>{const n=runtime.ambient.natlang as {load(p:string,o:object):Promise<unknown>};const f=await n.load(path,{services}) as (value:unknown)=>Promise<unknown>;return Array.isArray(goal)?(f as (...args:unknown[])=>Promise<unknown>)(...goal):f(goal);},{runId:'TEST-only-workspace-continuity',signal:new AbortController().signal});expect(turns).toBe(codes.length);return{value:result.value,records};}finally{runtime.close();}}


const assignment={id:'owned-panel-migration',goal:'Check the proposed destination',title:'Library reserves',original:'panels/library',destination:'projects/library',repository:'owned-repo',authority:{mode:'local',destination:'projects/library',revision:'owned-head'}};
const observed={id:assignment.id,workingRevision:'owned-head',mainRevision:'protected-main',repository:assignment.repository,location:assignment.original,layout:'original',destinationOwner:null,destinationPanel:false,compatiblePanel:true,actualSource:assignment.original,contractDigest:'actual-contract',buildIdentity:'current',manifestDigest:'manifest',consumerDigest:'guide',consumerLinks:[{id:'working',value:'actual-link',carrier:'scheme',source:assignment.original,scope:'working',compatible:true}]};
const investigation=[
 'const observed=await inspectMigration(assignment);return {observed,assessment:await planMigration(assignment,observed)};',
 'return readMigration(assignment.id);',
 'const placement=await assessPlacement(assignment,observed);const consumers=await assessConsumers(assignment,observed);return {decision:placement??(consumers.stale.length?"update-consumers":"keep-current"),reason:placement?"The proposed content-project destination is not a browser-panel root.":"The current moved panel accepts the stale working caller arguments."};',
 'return observed.destinationPanel?null:"hold-layout";',
 'return {stale:observed.consumerLinks.filter(row=>row.scope==="working"&&row.source===assignment.original).map(row=>row.id),blocked:[]};'
];
it('owns a feasibility question through its real investigation hierarchy without turning local permission into a move',async()=>{
 let reads=0;const result=await invoke('skills/open-user-goal/migratePanelSource.nl',{panelMigrationEvidence:{discover:async()=>assignment,inspect:async(id:string)=>{expect(id).toBe(assignment.id);reads++;return observed;}},panelMigrationChange:{}},[
 'const assignment=await discoverMigration();const inquiry=await investigateMigration(goal,assignment);if(inquiry.observed.destinationPanel||!inquiry.observed.compatiblePanel)throw Error("Confused current source with proposed destination");return {finding:"The current panel works with the callers, but a content-project destination is not a browser-panel build root. Leave it where it is.",move:null,identity:null,consumers:null};',...investigation
 ],'Someone proposed putting Library reserves underneath content projects. Verify whether its location and caller contract work there before making the move.');expect(reads).toBe(1);expect(result.value).toMatchObject({finding:expect.stringContaining('not a browser-panel'),move:null,identity:null,consumers:null});expect(result.records.some(r=>r.definition.source.endsWith('investigateMigration.nl'))).toBe(true);expect(result.records.some(r=>r.definition.source.endsWith('planMigration.nl'))).toBe(true);expect(result.records.some(r=>r.definition.source.endsWith('assessPlacement.nl'))).toBe(true);
},240000);
it('chooses only the actual remaining caller update and consumes its native feedback rather than a fixed move/align sequence',async()=>{
 const a={...assignment,destination:'panels/new-library',authority:{mode:'local',destination:'panels/new-library',revision:'owned-head'}};
 const o={...observed,layout:'moved',destinationPanel:true,location:a.destination,actualSource:a.destination,destinationOwner:a.repository};
 const receipt={status:'updated',workingRevision:'after-update',observation:{...o,workingRevision:'after-update',consumerLinks:o.consumerLinks.map(row=>({...row,source:a.destination}))},operation:{applicationId:'native-update',changeIds:['native-change']}};let updates=0;
 const result=await invoke('skills/open-user-goal/migratePanelSource.nl',{panelMigrationEvidence:{discover:async()=>a,inspect:async()=>o},panelMigrationChange:{update:async(id:string,head:string,digest:string)=>{expect([id,head,digest]).toEqual([a.id,o.workingRevision,o.consumerDigest]);updates++;return receipt;}}},[
 'const assignment=await discoverMigration();const inquiry=await investigateMigration(goal,assignment);const consumers=await updateConsumers(inquiry.observed);return {finding:consumers.status==="updated"?"Updated only the stale working callers; the moved source, build identity and pinned links were preserved.":"The actual native update did not complete.",move:null,identity:null,consumers};',...investigation
 ],'The panel already moved and resolves. Repair only its stale working callers.');expect(updates).toBe(1);expect(result.value).toEqual({finding:expect.stringContaining('Updated only'),move:null,identity:null,consumers:receipt});expect(result.records.some(r=>r.definition.source.endsWith('migratePanelSource.nl'))).toBe(true);
},240000);
