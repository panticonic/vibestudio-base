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
 const methodNames={adoptionReview:['discover','installed','compose','confirm','readback'],adoptionHandoff:['record']};
 services=Object.fromEntries(Object.entries(services).map(([name,value])=>[name,{...Object.fromEntries((methodNames[name as keyof typeof methodNames]??[]).map(method=>[method,()=>{throw Error('Unrequested Native call '+name+'.'+method);} ])),...value}]));
const owner=new AbortController();let turns=0;const records:{call_id:string;parent_call_id:string|null;definition:{source:string}}[]=[];const {rpc}=fakeRpc({records:{record:input=>{records.push(input.record);return{recordId:input.record.call_id};}},turn:async input=>{const code=codes[turns++];if(!code)throw Error('Unexpected continuation: '+JSON.stringify(input.context.messages.filter(m=>m.role==='toolResult').at(-1)?.content??''));return toolCallMessage('eval',{code,finish:true},{input:0,output:0});}});const runtime=createEvalNatlang({newFunction:testNewFunction(),owner:{kind:'user',objectKey:'TEST-only-workspace-continuity'},bindings:{rpc,fs:{readFile:path=>first(root=>readFile(join(root,path),'utf8')),stat:path=>first(root=>stat(join(root,path))),readdir:directory}}});try{const result=await runtime.runCell(async()=>{const n=runtime.ambient.natlang as {load(p:string,o:object):Promise<unknown>};const f=await n.load(path,{services}) as (value:unknown)=>Promise<unknown>;return Array.isArray(goal)?(f as (...args:unknown[])=>Promise<unknown>)(...goal):f(goal);},{runId:'TEST-only-workspace-continuity',signal:owner.signal});expect(turns).toBe(codes.length);return{value:result.value,records};}finally{owner.abort(new Error("TEST-only owner finished"));runtime.close();}}

const card={id:'owned-review',title:'Svelte Counter Review',event:'reviewed-event',edition:'staged',mayRecord:true};
const installed={repository:'panels/hello-svelte',packageName:'@workspace-panels/hello-svelte',manifestDigest:'installed-package',templateDigest:'installed-template',main:'protected-main'};
const composition={id:card.id,event:card.event,status:'composed',issue:null,owner:'Examples',privateFiles:['panels/hello-svelte/review-candidate.ts'],pulledUnits:['packages/formatter'],settings:['thinkingLevel=medium','model=actual-model'],minimumAppVersion:'0.1.120',digest:'actual-composition-digest'};
it('composes actual source investigation, useful note finding and fresh native readback through the public hierarchy',async()=>{
 const receipt={path:'/.tmp/owned/handoff.json',digest:'native-artifact-digest',event:card.event};let writes=0;
 const result=await invoke('skills/open-user-goal/reviewExamplesAdoption.nl',{adoptionReview:{discover:async()=>[card],installed:async(id:string)=>{expect(id).toBe(card.id);return installed;},compose:async(id:string,event:string)=>{expect([id,event]).toEqual([card.id,card.event]);return composition;},confirm:async()=>({status:'current',event:card.event}),readback:async(id:string,path:string)=>{expect([id,path]).toEqual([card.id,receipt.path]);return{main:'protected-main',event:card.event,digest:receipt.digest};}},adoptionHandoff:{record:async(id:string,event:string,draft:{finding:string;proof:string[]})=>{expect([id,event]).toEqual([card.id,card.event]);expect(Object.hasOwn(draft,'disposition')).toBe(false);expect(draft.finding).toContain(composition.privateFiles[0]);expect(draft.proof).toEqual([composition.owner,...composition.privateFiles]);writes++;return receipt;}}},[
 'const card=await findStagedComposition(goal);const evidence=await investigateAdoption(goal,card,null);const draft=await draftAdoptionNote(goal,evidence);const gate=await confirmAdoptionFrontier(card.id,card.event);if(gate.status!=="current")throw Error("Changed");const receipt=await recordPrivateAdoption(card.id,card.event,draft);const readback=await readAdoptionHandoff(card.id,receipt?.path??null);return explainAdoptionFinding(goal,card,evidence,gate,receipt,readback);',
 'return (await adoptionReview.discover()).find(row=>row.edition==="staged");',
 'return {installed:await readInstalledExamples(card.id),composition:await simulateOwnedComposition(card.id,card.event)};',
 'if(evidence.composition===null)throw Error("No observation");const proof=await selectAdoptionProof(goal,evidence);return {finding:"The replacement is owned by "+evidence.composition.owner+" and its surviving file is "+evidence.composition.privateFiles.join(", "),proof};',
 'if(evidence.composition===null||evidence.composition.owner===null)throw Error("No owner");return [evidence.composition.owner,...evidence.composition.privateFiles];',
 'if(evidence.composition===null||receipt===null||readback===null||readback.digest!==receipt.digest)throw Error("No verified handoff");return "The replacement is owned by "+evidence.composition.owner+"; the actual surviving file is "+evidence.composition.privateFiles.join(", ")+". Retained artifact "+receipt.path+" was verified at "+readback.event+"; main was preserved.";'
 ],'Keep a local composition record only if Examples owns the whole replacement. Identify the surviving candidate file and preserve main.');
 expect(writes).toBe(1);expect(result.value).toContain(composition.privateFiles[0]);expect(result.value).toContain(receipt.path);expect(result.records.some(r=>r.definition.source.endsWith('investigateAdoption.nl'))).toBe(true);expect(result.records.some(r=>r.definition.source.endsWith('selectAdoptionProof.nl'))).toBe(true);expect(result.records.some(r=>r.definition.source.endsWith('explainAdoptionFinding.nl'))).toBe(true);
},240000);
it('answers from the actual relevant composition without forcing an installed read, frontier check or private note',async()=>{
 let compositions=0;const result=await invoke('skills/open-user-goal/reviewExamplesAdoption.nl',{adoptionReview:{discover:async()=>[card],compose:async()=>{compositions++;return composition;}},adoptionHandoff:{}},[
 'const card=await findStagedComposition(goal);const evidence=await investigateAdoption(goal,card,null);return explainAdoptionFinding(goal,card,evidence,null,null,null);',
 'return (await adoptionReview.discover()).find(row=>row.edition==="staged");',
 'return {installed:null,composition:await simulateOwnedComposition(card.id,card.event)};',
 'if(evidence.composition===null)throw Error("Unread composition");return "The effective staged settings are "+evidence.composition.settings.join("; ")+". No private note or installation was created.";'
 ],'What thinking level and inherited model does this staged composition use? Answer here; keep no file.');expect(compositions).toBe(1);expect(result.value).toContain('thinkingLevel=medium');expect(result.value).toContain('model=actual-model');
},240000);
it('consumes actual refused-write and changed readback feedback rather than returning an earlier plan as success',async()=>{
 let attempts=0;const result=await invoke('skills/open-user-goal/reviewExamplesAdoption.nl',{adoptionReview:{discover:async()=>[card],compose:async()=>composition,readback:async(id:string,path:unknown)=>{expect([id,path]).toEqual([card.id,null]);return {main:'protected-main',event:'restaged-event',digest:null};}},adoptionHandoff:{record:async()=>{attempts++;return null;}}},[
 'const card=await findStagedComposition(goal);const evidence=await investigateAdoption(goal,card,null);const draft=await draftAdoptionNote(goal,evidence);const receipt=await recordPrivateAdoption(card.id,card.event,draft);const readback=await readAdoptionHandoff(card.id,receipt?.path??null);return explainAdoptionFinding(goal,card,evidence,null,receipt,readback);',
 'return (await adoptionReview.discover()).find(row=>row.edition==="staged");',
 'return {installed:null,composition:await simulateOwnedComposition(card.id,card.event)};',
 'if(evidence.composition===null)throw Error("Unread composition");return {finding:"Actual observed owner "+evidence.composition.owner,proof:[]};',
 'if(receipt!==null||readback===null||readback.event===card.event)throw Error("Wrong actual feedback");return "No private record was kept. The actual current review changed to "+readback.event+"; the earlier composition is historical evidence, not permission to write now.";'
 ],'Keep the exact evidence only if the reviewed frontier still holds. Otherwise identify the live review as a hold.');expect(attempts).toBe(1);expect(result.value).toContain('No private record was kept');expect(result.value).toContain('restaged-event');
},240000);
