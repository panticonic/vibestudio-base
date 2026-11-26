/** TEST ONLY: real public loader/evaluator with scripted semantic choices and exact Native callbacks; no provider calls. */
import {expect,it} from 'vitest';
import {readFile,readdir,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createEvalNatlang} from './index.js';
import {fakeRpc,testNewFunction,toolCallMessage} from './testSupport.js';
const base=fileURLToPath(new URL('../../..',import.meta.url));
const roots=[base,process.env.VIBE_GOOGLE_TEMPLATE!,process.env.VIBE_SYSTEM_TEMPLATE!].filter(Boolean);
async function first<T>(op:(root:string)=>Promise<T>){let last;for(const root of roots)try{return await op(root);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;last=error;}throw last;}
async function directory(path:string){const seen=new Map();for(const root of roots)try{for(const entry of await readdir(join(root,path),{withFileTypes:true}))if(!seen.has(entry.name))seen.set(entry.name,entry);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}if(!seen.size)return first(root=>readdir(join(root,path),{withFileTypes:true}));return [...seen.values()];}
async function invoke(path:string,services:object,codes:string[],goal:string){let turns=0;const records:{call_id:string;parent_call_id:string|null;definition:{source:string}}[]=[];const {rpc}=fakeRpc({records:{record:input=>{records.push(input.record);return{recordId:input.record.call_id};}},turn:async input=>{const code=codes[turns++];if(!code)throw Error('Unexpected continuation: '+JSON.stringify(input.context.messages.filter(m=>m.role==='toolResult').at(-1)?.content??''));return toolCallMessage('eval',{code,finish:true},{input:0,output:0});}});const runtime=createEvalNatlang({newFunction:testNewFunction(),owner:{kind:'user',objectKey:'TEST-only-terminal-runbook'},bindings:{rpc,fs:{readFile:path=>first(root=>readFile(join(root,path),'utf8')),stat:path=>first(root=>stat(join(root,path))),readdir:directory}}});try{const result=await runtime.runCell(async()=>{const n=runtime.ambient.natlang as {load(p:string,o:object):Promise<unknown>};const f=await n.load(path,{services}) as (goal:string)=>Promise<unknown>;return f(goal);},{runId:'TEST-only-terminal-runbook',signal:new AbortController().signal});expect(turns).toBe(codes.length);return{value:result.value,records};}finally{runtime.close();}}
it('coordinates actual scoped terminal input through semantic decisions and reports the actual Native event',async()=>{
 const screen={sessionId:'owned-session',ptyId:'owned-pty',cols:80,rows:24,checked:['1']};const calls:string[]=[];
 const services={openTerminalRead:{open:async()=>{calls.push('open');return{screen,grants:{edit:true,inspectSuite:false,restart:false,interrupt:false,finish:false,stage:false},note:null,checkOperationId:null,discoveryAvailable:false};}},openTerminalInput:{change:async(change:{item:string;checked:boolean;input:string})=>{expect(change).toEqual({item:'2',checked:true,input:'mouse'});calls.push('change');return{operation:'change',change,from:screen,to:{...screen,checked:['1','2']}};}},openTerminalLifecycle:{advance:async()=>{throw Error('No lifecycle action requested');}},openTerminalHandoff:{stage:async()=>{throw Error('No retained handoff requested');}}};
 const result=await invoke('skills/open-user-goal/workOnTerminalGoal.nl',services,[
 'const opening=await terminal.openTerminal();const before={events:[],checkReport:null,discovery:null,handoff:null,refused:false};const action=await chooseTerminalAction(goal,opening,before);if(action.kind!=="change")throw Error("Expected requested input");const event=await terminal.applyChecklistChange(action.change);if(!event)throw Error("Native input refused");const progress={...before,events:[event]};return {answer:(await composeTerminalOutcome(goal,opening,progress)).explanation};',
 'return {kind:"change",change:{item:"2",checked:true,input:"mouse"}};',
 'return {disposition:"ready",explanation:"The pointer marked Review complete; Build remains checked in the actual owned session."};',
 ],'Use the pointer to mark Review complete. Preserve Build prepared and report the actual screen.');
 expect(calls).toEqual(['open','change']);expect(result.value).toEqual({answer:'The pointer marked Review complete; Build remains checked in the actual owned session.'});const root=result.records.find(r=>r.parent_call_id===null&&r.definition.source.endsWith('workOnTerminalGoal.nl'))!;expect(root).toBeDefined();expect(result.records.some(r=>r.parent_call_id===root.call_id&&r.definition.source.endsWith('chooseTerminalAction.nl'))).toBe(true);
},180000);
it('uses the actual mounted Calendar and provenance codebases for a read-only unresolved runbook question without a write',async()=>{
 const local={documents:[{path:'operations-runbook.md',version:'current-file',text:'Start: 09:30 UTC'}],authorization:'inspect',currentRevision:'current-context'};const calls:string[]=[];
 const services={googleRunbook:{read:async()=>{calls.push('read-runbook');return local;},apply:async()=>{throw Error('Read-only request forbids an edit');}},calendarGoalCatalog:{discover:async()=>{calls.push('calendar-catalog');return[];}}};
 const result=await invoke('skills/open-user-goal/reconcileGoogleRunbook.nl',services,[
 'const local=await readRunbookBasis();const calendar=await reviewCalendar(goal,local);const decision=await reconcileApproval(goal,local,calendar);return {decision,write:null,attribution:await attributeBasis(goal,local,calendar,decision)};',
 'return await installed.workOnCalendarGoal(goal);',
 'return null;',
 'return {action:"held",path:null,approval:null,reason:"The requested current appointment is unavailable; the retained runbook is not present scheduling authority."};',
 'return await installed.reviewProvenance({kind:"attribution",goal,receipt:{origin:"external-import",actor:null,sourceRef:null,sourceRevision:local.currentRevision,decisionRef:null,actionRef:"runbook:"+local.currentRevision,statedIntentRef:null,visibleBoundary:"private-workspace"}});',
 'return await attributeOrigin(request);',
 'return {kind:"attribution",origin:request.receipt.origin,references:[request.receipt.actionRef],supportedIntent:null,boundary:request.receipt.visibleBoundary};',
 ],'Inspect the private runbook against the current appointment. Explain any missing authority without changing documents.');
 expect(calls).toEqual(['read-runbook','calendar-catalog']);expect(result.value).toMatchObject({decision:{action:'held',approval:null},write:null,attribution:{kind:'attribution',references:['runbook:current-context']}});expect(result.records.some(r=>r.definition.source.includes('reviewCalendar/installed/workOnCalendarGoal/chooseCalendarPlan.nl'))).toBe(true);expect(result.records.some(r=>r.definition.source.includes('attributeBasis/installed/reviewProvenance/attributeOrigin.nl'))).toBe(true);
},180000);

it('allows a runbook inspection to omit unrequested provenance work without fabricating an attribution',async()=>{
 const calls:string[]=[];const services={googleRunbook:{read:async()=>{calls.push('read');return{documents:[],authorization:'inspect',currentRevision:'current'};},apply:async()=>{throw Error('No edit requested');}},calendarGoalCatalog:{discover:async()=>{calls.push('calendar');return[];}}};
 const result=await invoke('skills/open-user-goal/reconcileGoogleRunbook.nl',services,[
 'const local=await readRunbookBasis();const calendar=await reviewCalendar(goal,local);return {decision:await reconcileApproval(goal,local,calendar),write:null,attribution:null};',
 'return await installed.workOnCalendarGoal(goal);',
 'return null;',
 'return {action:"held",path:null,approval:null,reason:"No current appointment was available to compare with the retained runbook."};',
 ],'Inspect whether the current appointment can establish this retained runbook. Do not change documents.');
 expect(calls).toEqual(['read','calendar']);expect(result.value).toMatchObject({decision:{action:'held'},write:null,attribution:null});expect(result.records.some(record=>record.definition.source.includes('attributeBasis'))).toBe(false);
},180000);
