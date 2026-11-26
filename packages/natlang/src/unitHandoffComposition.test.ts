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
async function invoke(path:string,services:object,codes:string[],goal:unknown){
 const methodNames={unitHandoff:['discover','begin','lifecycle'],unitIdentity:['observe','resolve','stage']};
 services=Object.fromEntries(Object.entries(services).map(([name,value])=>[name,{...Object.fromEntries((methodNames[name as keyof typeof methodNames]??[]).map(method=>[method,()=>{throw Error('Unrequested Native call '+name+'.'+method);} ])),...value}]));
let turns=0;const records:{call_id:string;parent_call_id:string|null;definition:{source:string}}[]=[];const {rpc}=fakeRpc({records:{record:input=>{records.push(input.record);return{recordId:input.record.call_id};}},turn:async input=>{const code=codes[turns++];if(!code)throw Error('Unexpected continuation: '+JSON.stringify(input.context.messages.filter(m=>m.role==='toolResult').at(-1)?.content??''));return toolCallMessage('eval',{code,finish:true},{input:0,output:0});}});const runtime=createEvalNatlang({newFunction:testNewFunction(),owner:{kind:'user',objectKey:'TEST-only-workspace-continuity'},bindings:{rpc,fs:{readFile:path=>first(root=>readFile(join(root,path),'utf8')),stat:path=>first(root=>stat(join(root,path))),readdir:directory}}});try{const result=await runtime.runCell(async()=>{const n=runtime.ambient.natlang as {load(p:string,o:object):Promise<unknown>};const f=await n.load(path,{services}) as (value:unknown)=>Promise<unknown>;return Array.isArray(goal)?(f as (...args:unknown[])=>Promise<unknown>)(...goal):f(goal);},{runId:'TEST-only-workspace-continuity',signal:new AbortController().signal});expect(turns).toBe(codes.length);return{value:result.value,records};}finally{runtime.close();}}


it('owns a manifest query hierarchy without requiring a private installed report or icon route',async()=>{
 const unit={path:'extensions/file-tools',name:'file-tools',kind:'extension',description:'Find workspace files'};
 const goal='Which manifest copy has the invalid dependency setting? Leave both copies alone.';
 const plan={path:unit.path,focus:'manifest',inspectLifecycle:false,stageIcon:false,requireProtectedSource:false,reason:'Review the exact finder.'};
 const anchor={digest:'actual-working',validationError:'MANIFEST_EXTENSION',entry:'index.ts',activationEvents:['onInvoke'],dependencyMode:'invalid-setting',icon:'./assets/icon.svg'};
 const observation={unit,revision:'actual-working',mainRevision:'protected-main',manifest:{working:anchor,protectedMain:{...anchor,digest:'actual-main',validationError:null,dependencyMode:'auto'}},designRequest:{kind:'extension-design-live',goal,operationId:'owned-design'},identityRequest:{goal,operationId:'owned-identity',unit:{name:unit.name,kind:unit.kind,description:unit.description},prepare:false}};
 let reads=0;const result=await invoke('skills/open-user-goal/reviewUnitHandoffGoal.nl',{unitHandoff:{discover:async()=>[unit],begin:async(path:string)=>{expect(path).toBe(unit.path);reads++;return observation;},lifecycle:async()=>{throw Error('A manifest query does not request runtime inspection');}},unitIdentity:{observe:async()=>{throw Error('No icon inquiry requested');}}},[
 'const inquiry=await investigateUnitHandoff(goal);return completeHandoff(goal,inquiry,null);',
 'const inventory=await readInstalledUnits();const plan=await chooseUnit(goal,inventory);const observation=plan.path?await beginUnit(plan.path):null;return {inventory,plan,observation,design:null};',
 'return {path:units[0].path,focus:"manifest",inspectLifecycle:false,stageIcon:false,requireProtectedSource:false,reason:"The exact finder has the requested package evidence."};',
 'if(!inquiry.observation?.manifest?.working.validationError||inquiry.observation.manifest.protectedMain.validationError)throw Error("No native validation distinction");return {explanation:"The working finder manifest is invalid; protected main passes the native manifest check. Neither copy was changed.",unit:inquiry.observation.unit,draft:null};'
 ],goal);expect(reads).toBe(1);expect(result.value).toMatchObject({unit,draft:null,explanation:expect.stringContaining('working finder manifest is invalid')});expect(result.records.some(r=>r.definition.source.endsWith('investigateUnitHandoff.nl'))).toBe(true);
},240000);
it('composes actual icon intent, scoped native preparation and a requested draft result',async()=>{
 const unit={path:'panels/terminal',name:'terminal',kind:'panel',description:'Interactive terminal view'};
 const goal='Give this interactive terminal a square-terminal Lucide working draft. Keep protected main and the shell service unchanged.';
 const plan={path:unit.path,focus:'identity',inspectLifecycle:false,stageIcon:true,requireProtectedSource:false,reason:'A requested working-only identity draft.'};
 const request={goal,operationId:'owned-identity',unit:{name:unit.name,kind:unit.kind,description:unit.description},prepare:true};const observation={unit,revision:'actual-working',mainRevision:'protected-main',manifest:null,designRequest:null,identityRequest:request};
 const opening={repoPath:unit.path,revision:observation.revision,icon:'./assets/icon.svg',artworkDigest:'old-artwork'},candidate={choice:{family:'lucide',id:'lucide:square-terminal'},declaration:'./assets/icon.svg',artworkDigest:'actual-catalog-artwork'},change={repoPath:unit.path,revision:'native-prepared',icon:candidate.declaration,artworkDigest:candidate.artworkDigest,mainUnchanged:true,manifestOtherwiseUnchanged:true,changedFiles:['assets/icon.svg','package.json']};let writes=0;
 const result=await invoke('skills/open-user-goal/reviewUnitHandoffGoal.nl',{unitHandoff:{discover:async()=>[unit],begin:async(path:string)=>{expect(path).toBe(unit.path);return observation;}},unitIdentity:{observe:async(id:string)=>{expect(id).toBe(request.operationId);return opening;},resolve:async(id:string,intent:unknown)=>{expect(id).toBe(request.operationId);expect(intent).toEqual({family:'lucide',term:'square-terminal'});return candidate;},stage:async(id:string,revision:string,choice:string)=>{expect([id,revision,choice]).toEqual([request.operationId,opening.revision,candidate.choice.id]);writes++;return change;}}},[
 'const inquiry=await investigateUnitHandoff(goal);if(!inquiry.observation)throw Error("No observed unit");const identity=await reviewIdentity(goal,inquiry.plan,inquiry.observation,inquiry.design);return completeHandoff(goal,inquiry,identity);',
 'const inventory=await readInstalledUnits();const plan=await chooseUnit(goal,inventory);return {inventory,plan,observation:await beginUnit(plan.path),design:null};',
 'return {path:units[0].path,focus:"identity",inspectLifecycle:false,stageIcon:true,requireProtectedSource:false,reason:"The exact requested panel has an owned working-only draft grant."};',
 'const prepare=await authorizeDraft(plan,observation,design);return installed.prepareUnitIdentity({...observation.identityRequest,goal,prepare});',
 'return plan.stageIcon&&observation.identityRequest.prepare;',
 'const observed=await unitIdentity.observe(request.operationId);const intent=await chooseRequestedIcon(request.goal,request.unit);const assessment=await assessIcon(request,intent,observed);if(!assessment.candidate||assessment.next!=="prepare")throw Error("No actual candidate and draft request");const change=await unitIdentity.stage(request.operationId,observed.revision,assessment.candidate.choice.id);return {observed,intent,assessment,change,outcome:await verifyUnitIdentity(observed,assessment.candidate,change)};',
 'if(!goal.includes("square-terminal"))throw Error("Lost the original exact request");return {family:"lucide",term:"square-terminal"};',
 'const candidate=await unitIdentity.resolve(request.operationId,intent);if(!candidate)return {candidate:null,next:"hold"};return {candidate,next:await chooseIconAction(candidate,observed,request.prepare)};',
 'return prepare?"prepare":"design-only";',
 'if(change.artworkDigest!==candidate.artworkDigest||!change.mainUnchanged||!change.manifestOtherwiseUnchanged)throw Error("Native readback mismatch");return "prepared";',
 'if(!identity?.change||identity.outcome!=="prepared")throw Error("No verified actual draft");return {explanation:"The exact square-terminal artwork was prepared in the owned working panel. Protected main and all non-icon metadata remain unchanged.",unit:inquiry.observation.unit,draft:identity.change};'
 ],goal);expect(writes).toBe(1);expect(result.value).toMatchObject({unit,draft:change});expect(result.records.some(r=>r.definition.source.endsWith('chooseRequestedIcon.nl'))).toBe(true);
},240000);
