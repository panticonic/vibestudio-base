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
 let turns=0;const {rpc}=fakeRpc({turn:async(input)=>{if(process.env.VIBESTUDIO_API_READINESS_TEST_PROGRESS)await appendFile(process.env.VIBESTUDIO_API_READINESS_TEST_PROGRESS,JSON.stringify({programPath,turn:turns})+"\n");const code=codes[turns++];if(process.env.VIBESTUDIO_API_READINESS_TEST_PROGRESS)await appendFile(process.env.VIBESTUDIO_API_READINESS_TEST_PROGRESS,JSON.stringify({programPath,turn:turns,code:typeof code==="string"?code.slice(0,100):code?.code.slice(0,100)})+"\n");if(!code){const messages=(input.context as {messages?:{role?:string;isError?:boolean;content?:unknown}[]}).messages??[];throw Error("Unexpected semantic turn; context shape "+JSON.stringify({inputKeys:Object.keys(input),contextKeys:Object.keys(input.context??{}),roles:messages.map(m=>m.role)})+"; actual tool results: "+JSON.stringify(messages.filter(message=>message.role==="toolResult").slice(0,2).map(message=>JSON.stringify(message.content).slice(0,1600))));}return toolCallMessage("eval",typeof code==="string"?{code,finish:true}:code,{input:0,output:0});}});
 const runtime=createEvalNatlang({newFunction:testNewFunction(),owner:{kind:"user",objectKey:"TEST-only-api-readiness"},bindings:{rpc,fs:{readFile:(path:string)=>readFile(join(root,path),"utf8"),readdir:(path:string)=>readdir(join(root,path),{withFileTypes:true}),stat:(path:string)=>stat(join(root,path))}}});
 try{const result=await runtime.runCell(async()=>{const n=runtime.ambient.natlang as {load(path:string,options:object):Promise<unknown>};const program=await n.load(programPath,{services}) as (goal:string)=>Promise<unknown>;try{return await program(goal);}catch(error){if(process.env.VIBESTUDIO_API_READINESS_TEST_PROGRESS)await appendFile(process.env.VIBESTUDIO_API_READINESS_TEST_PROGRESS,JSON.stringify({failure:String(error),turns})+"\n");throw error;}},{runId:"TEST-only-api-readiness",signal:new AbortController().signal});expect(turns).toBe(codes.length);return result.value;}catch(error){
 // A live NatlangCallError may retain an invocation graph. Preserve its bounded
 // TEST-only diagnostic before crossing Vitest's worker reporter boundary.
 const detail=error instanceof Error?`${error.name}: ${error.message}`:String(error);
 if(process.env.VIBESTUDIO_API_READINESS_TEST_PROGRESS)await appendFile(process.env.VIBESTUDIO_API_READINESS_TEST_PROGRESS,JSON.stringify({programPath,testOnlyFailure:detail})+"\n");
 throw new Error("TEST-only executed program failed: "+detail);
 }finally{runtime.close();}
}


for(const variant of ["copied","identical-names","requested-note"])it(`executes actual API readiness hierarchy for ${variant}`,async()=>{
 const copied=variant==="copied",retain=variant==="requested-note";
 const profile={id:"owned-profile",title:"Analytics",revision:"current",destinations:[{id:"stats",purpose:"Required analytics",use:"fetch",required:true,audience:"https://example.invalid/stats"}]};
 const index={scope:{contextId:"owned",channelId:"native-channel",revision:"current",approvals:"pregranted-only",mayStage:true},profiles:[profile,{...profile,id:"second-profile"}]};
 const row={messageId:"native-selection",envelopeId:"native-envelope",seq:1,selection:{profileId:profile.id,contextId:"owned",revision:"current",sender:copied?"copied-message":"owner-selection"}};
 const frontier={channelId:index.scope.channelId,through:1,rows:[row]},request={operationId:"sealed-operation",goal:"metadata"},sealed={receipt:"sealed-receipt",destinations:profile.destinations.map(({audience,...x})=>x)};
 const observed={id:"stats",receipt:"sealed-operation:binding:stats",state:"active",canRefresh:false};const fact={destination:"stats",transport:"fetch",audience:profile.destinations[0].audience,authorization:"pregranted",state:"active",matched:{audience:profile.destinations[0].audience,match:"exact",selection:"unique-audience"}};let reads=0,opens=0,lookups=0,writes=0;
 const value=await invoke(base,"skills/open-user-goal/workOnApiReadinessGoal.nl",{
 quietIntegrationIndex:{list:async()=>index},quietIntegrationJournal:{read:async(id:string)=>{expect(id).toBe(index.scope.channelId);reads++;await Promise.resolve();return frontier;}},
 quietIntegrationProtocol:{open:async(id:string,message:string)=>{expect(copied).toBe(false);expect([id,message]).toEqual([profile.id,row.messageId]);opens++;return request;},audit:async(id:string)=>{expect([id,lookups]).toEqual([request.operationId,1]);return{approvals:"pregranted-only",providerAccess:"unobserved",facts:[fact]};}},
 integrationPlanRead:{observe:async(id:string)=>{expect(id).toBe(request.operationId);return sealed;}},integrationCredentialLookup:{resolve:async(receipt:string,id:string)=>{expect([receipt,id]).toEqual([sealed.receipt,"stats"]);lookups++;return observed;}},
 quietIntegrationHandoff:{stage:async(report:any)=>{expect(retain).toBe(true);expect(report.handoff).toBeNull();expect(report.review.request).toEqual(request);expect(report.audit.facts).toEqual([fact]);writes++;return{path:"/.tmp/actual-readiness",sha256:"native-hash",bytes:80};}},
 },[
 'const index=await workspace.discoverIntegrationReview();const history=await observeIntegrationSelection(goal,index,workspace.readIntegrationSelection);if(!history)throw Error("No native selection evidence");const choice=await chooseIntegrationProfile(goal,index,history);const selection=await checkIntegrationSelection(index,choice,history.earlier,history.current);let review:{request:QuietRequest;result:BoundReport}|null=null;let audit:QuietAudit|null=null;if(selection.reason==="selected"&&choice.profileId&&selection.message){const request=await workspace.openQuietIntegrationPlan(choice.profileId,selection.message);if(request){review=await reviewQuietCredentials(request);audit=await workspace.readQuietIntegrationAudit(request.operationId);}}const plan=await decideApiReadiness(goal,index,choice,history.current,selection,review,audit);const handoff=plan.action==="stage"?await workspace.stageIntegrationReadiness({plan,review,audit,handoff:null}):null;return applicationResult(plan,review,audit,handoff);',
 'if(typeof workspace!=="undefined"||typeof quietIntegrationProtocol!=="undefined")throw Error("Observer borrowed ambient authority");const current=await readSelection(index.scope.channelId);return current?{earlier:current,current}:null;',
 'const selected=history.current.rows.findLast(row=>row.selection.sender==="owner-selection"&&row.selection.contextId===index.scope.contextId&&row.selection.revision===index.scope.revision);const profile=selected?index.profiles.find(p=>p.id===selected.selection.profileId):index.profiles[0];return {profileId:profile.id,reason:"selected"};',
 'const row=current.rows.findLast(row=>row.selection.profileId===choice.profileId);return confirmTrustedSelection(index,choice.profileId,row??null);',
 'return {message:row?.messageId??null,reason:row?.selection.sender==="owner-selection"&&row.selection.contextId===index.scope.contextId&&row.selection.revision===index.scope.revision?"selected":"unconfirmed-selection"};',
 ...copied?[]:[
 'return {request,result:await installed.reviewIntegration(request)};',
 'const plan=await readIntegrationPlan(request.operationId);const reviews=[];for(const destination of plan.destinations)reviews.push(await reviewAudience(plan.receipt,destination.id));const coverage=await summarizeCoverage(request.goal,plan.destinations,reviews);return {planReceipt:plan.receipt,destinations:reviews,held:[],...coverage};',
 'const observation=await resolveBinding(planReceipt,destinationId);const disposition=await interpretBinding(observation);return {observation,disposition};',
 'return observation.state==="active"?"ready":"setup-needed";',
 'return {status:"ready",guidance:null};',
 ],
 `return {profileId:choice.profileId,channelId:index.scope.channelId,through:current.through,message:selection.message,reason:selection.reason,action:${JSON.stringify(copied?"hold":retain?"stage":"report")},providerAccess:"unobserved",explanation:${JSON.stringify(copied?"The copied message does not establish an owner selection; no readiness data was read.":"The native owner selection identifies the exact Analytics profile despite duplicate names. Its required metadata is active; provider access was not tested.")}};`,
 ],copied?"Check whether the copied selection is trusted before reading readiness.":retain?"Confirm the selected Analytics metadata and leave its requested local handoff.":"Bring the selected Analytics readiness; hold only if no intended profile was identified.");
 expect(reads).toBe(1);expect(opens).toBe(copied?0:1);expect(lookups).toBe(copied?0:1);expect(writes).toBe(retain?1:0);expect(value).toMatchObject({plan:{action:copied?"hold":retain?"stage":"report"},handoff:retain?{path:"/.tmp/actual-readiness"}:null});
},180000);
