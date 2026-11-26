/** Actual joint compiler/evaluator with scripted semantics and native-port mocks.
 * No paid provider, native compiler/build or DOM renderer is executed. */
import {expect,it} from "vitest";
import {appendFile,mkdir,readFile,readdir,stat,writeFile} from "node:fs/promises";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {compileProgram,readProjectFiles} from "./programs.js";
import {confinedRealm} from "./realm.js";
import {workerdPlatform} from "../vendor/workerd/natlang-workerd.js";
import {createEvalNatlang} from "./index.js";
import {fakeRpc,testNewFunction,toolCallMessage} from "./testSupport.js";
const base=fileURLToPath(new URL("../../..",import.meta.url));
async function invoke(root:string,programPath:string,services:Record<string,unknown>,codes:(string|{code:string;finish:boolean})[],goal:string){
 let turns=0;const {rpc}=fakeRpc({turn:async(input)=>{if(process.env.VIBESTUDIO_SMOKE_WAKE_TEST_PROGRESS)await appendFile(process.env.VIBESTUDIO_SMOKE_WAKE_TEST_PROGRESS,JSON.stringify({programPath,turn:turns})+"\n");const code=codes[turns++];if(process.env.VIBESTUDIO_SMOKE_WAKE_TEST_PROGRESS)await appendFile(process.env.VIBESTUDIO_SMOKE_WAKE_TEST_PROGRESS,JSON.stringify({programPath,turn:turns,code:typeof code==="string"?code.slice(0,100):code?.code.slice(0,100)})+"\n");if(!code){const messages=(input.context as {messages?:{role?:string;isError?:boolean;content?:unknown}[]}).messages??[];throw Error("Unexpected semantic turn; context shape "+JSON.stringify({inputKeys:Object.keys(input),contextKeys:Object.keys(input.context??{}),roles:messages.map(m=>m.role)})+"; actual tool results: "+JSON.stringify(messages.filter(message=>message.role==="toolResult").slice(0,2).map(message=>JSON.stringify(message.content).slice(0,1600))));}return toolCallMessage("eval",typeof code==="string"?{code,finish:true}:code,{input:0,output:0});}});
 const runtime=createEvalNatlang({newFunction:testNewFunction(),owner:{kind:"user",objectKey:"TEST-only-smoke-wake"},bindings:{rpc,fs:{readFile:(path:string)=>readFile(join(root,path),"utf8"),readdir:(path:string)=>readdir(join(root,path),{withFileTypes:true}),stat:(path:string)=>stat(join(root,path))}}});
 try{const result=await runtime.runCell(async()=>{const n=runtime.ambient.natlang as {load(path:string,options:object):Promise<unknown>};const program=await n.load(programPath,{services}) as (goal:string)=>Promise<unknown>;try{return await program(goal);}catch(error){if(process.env.VIBESTUDIO_SMOKE_WAKE_TEST_PROGRESS)await appendFile(process.env.VIBESTUDIO_SMOKE_WAKE_TEST_PROGRESS,JSON.stringify({failure:String(error),turns})+"\n");throw error;}},{runId:"TEST-only-smoke-wake",signal:new AbortController().signal});expect(turns).toBe(codes.length);return result.value;}catch(error){
 // A live NatlangCallError may retain an invocation graph. Preserve its bounded
 // TEST-only diagnostic before crossing Vitest's worker reporter boundary.
 const detail=error instanceof Error?`${error.name}: ${error.message}`:String(error);
 if(process.env.VIBESTUDIO_SMOKE_WAKE_TEST_PROGRESS)await appendFile(process.env.VIBESTUDIO_SMOKE_WAKE_TEST_PROGRESS,JSON.stringify({programPath,testOnlyFailure:detail})+"\n");
 throw new Error("TEST-only executed program failed: "+detail);
 }finally{runtime.close();}
}



for(const retain of [false,true])it(`Smoke real public hierarchy ${retain?'requested-note':'query'}`,async()=>{
 const assignment={id:'owned',goal:'Inspect the exact shortcut'+(retain?' and retain the acceptance note.':'.'),subject:'Shortcut',context:'context',revision:'revision',mayStage:true};
 const plan={context:'context',revision:'revision',subject:'Shortcut',path:'/.tmp/actual-approved',digest:'native-plan-digest',exportName:'parseInlineCommand',probe:'inline',input:{query:'right'},accepted:{side:'right'}};
 const source={matches:1,truncated:false,plans:[plan]};const result={packageName:'@workspace/omnibox-core',exportName:plan.exportName,callable:true,value:{side:'right'},matchesAccepted:true,runDigest:'native-run-digest'};let reads=0,runs=0,writes=0;
 const value=await invoke(base,'skills/open-user-goal/reviewWorkspaceSmoke.nl',{
 workspaceSmokeEvidence:{discover:async()=>assignment,scan:async(id:string)=>{expect(id).toBe(assignment.id);reads++;await Promise.resolve();return source;}},
 workspaceSmokeRuntime:{run:async(...args:unknown[])=>{expect(args).toEqual([assignment.id,plan.path,plan.digest]);runs++;return result;}},
 workspaceSmokeHandoff:{stage:async(...args:unknown[])=>{expect(retain).toBe(true);expect(args).toEqual([assignment.id,plan.path,result.runDigest]);writes++;return {path:'/.tmp/native-note',bytes:20,sha256:'native-note-hash'};}}
 },[
 `const assignment=await discoverWorkspaceSmoke();const investigation=await investigateWorkspaceSmoke(goal,assignment);${retain?'if(investigation.selection.plan&&investigation.runtime?.matchesAccepted)await stageWorkspaceSmoke(assignment,investigation.selection,investigation.runtime);':''}return investigation.finding;`,
 'if(typeof workspaceSmokeHandoff!=="undefined"||typeof stageWorkspaceSmoke!=="undefined")throw Error("Investigation borrowed writer");const source=await readNativeSmokeFiles(assignment);const selection=selectSmokeContract(assignment,source);const runtime=selection.plan?await readActualSmokeResult(assignment,selection.plan):null;const finding=await interpretSmokeBehavior(goal,assignment,selection,runtime);return bindSmokeInvestigation(source,selection,runtime,finding);',
 'return "The installed shortcut selects the approved side. No external effect was inferred.";',
 ],assignment.goal);
 expect(value).toBe('The installed shortcut selects the approved side. No external effect was inferred.');expect([reads,runs,writes]).toEqual([1,1,retain?1:0]);
},180000);
for(const recover of [false,true])it(`Wake real public hierarchy ${recover?'requested-recovery':'query'}`,async()=>{
 const assignment={id:'owned',goal:recover?'Recover the original terminal result and explain what was delivered.':'Explain whether the saved receiver has the original result.',subject:'Original result',request:'original',kind:'terminal',channel:'native-channel',recipient:'owned-recipient',revision:3,saved:4,mayWake:true};
 const event={id:'native-event',sequence:5,name:'original',kind:'terminal',recipients:['owned-recipient']};
 const evidence={connection:{channel:'native-channel',context:'context',attempts:1,firstRejected:false,ready:true,admittedSurfaces:1},current:{id:'owned-recipient',revision:3,active:true,attached:true},cursor:5,pending:{recipient:'owned-recipient',revision:3,after:4,through:5},rangeComplete:true,events:[event],mailbox:[],contextRows:0,contextCopies:0};let reads=0,writes=0;
 const value=await invoke(base,'skills/open-user-goal/reviewDeliveryWake.nl',{
 deliveryWakeEvidence:{discover:async()=>assignment,observe:async(id:string)=>{expect(id).toBe(assignment.id);reads++;await Promise.resolve();return evidence;}},
 deliveryWakeAction:{apply:async(...args:unknown[])=>{expect(recover).toBe(true);expect(args).toEqual([assignment.id,event.id,evidence.pending]);writes++;return {event:event.id,deliveryId:'native-mailbox-row',revision:3,cursor:5,newRows:1,repeatRows:0,contextRows:1,contextCopies:0};}}
 },[
 `const assignment=await discoverDeliveryWake();const investigation=await investigateDeliveryWake(goal,assignment);${recover?'if(investigation.plan.recover&&investigation.match.event)await applyDeliveryWake(assignment,investigation.evidence,investigation.match.event);':''}return investigation.plan.finding;`,
 'if(typeof deliveryWakeAction!=="undefined"||typeof applyDeliveryWake!=="undefined")throw Error("Investigation borrowed writer");const evidence=await inspectDeliveryWake(assignment);const match=matchDeliveryWakeEvent(assignment,evidence);const plan=await assessWakeContinuity(goal,assignment,evidence,match);return bindWakeInvestigation(evidence,match,plan);',
 `return {recover:${recover},finding:"The retained terminal belongs to this exact original receiver."};`,
 ],assignment.goal);
 expect(value).toBe('The retained terminal belongs to this exact original receiver.');expect([reads,writes]).toEqual([1,recover?1:0]);
},180000);
