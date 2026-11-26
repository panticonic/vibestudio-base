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
 let turns=0;const {rpc}=fakeRpc({turn:async(input)=>{if(process.env.VIBESTUDIO_RETAINED_HANDOFF_TEST_PROGRESS)await appendFile(process.env.VIBESTUDIO_RETAINED_HANDOFF_TEST_PROGRESS,JSON.stringify({programPath,turn:turns})+"\n");const code=codes[turns++];if(!code){const messages=(input.context as {messages?:{role?:string;isError?:boolean;content?:unknown}[]}).messages??[];throw Error("Unexpected semantic turn; context shape "+JSON.stringify({inputKeys:Object.keys(input),contextKeys:Object.keys(input.context??{}),roles:messages.map(m=>m.role)})+"; actual tool results: "+JSON.stringify(messages.filter(message=>message.role==="toolResult").slice(0,2).map(message=>JSON.stringify(message.content).slice(0,1600))));}return toolCallMessage("eval",typeof code==="string"?{code,finish:true}:code,{input:0,output:0});}});
 const runtime=createEvalNatlang({newFunction:testNewFunction(),owner:{kind:"user",objectKey:"TEST-only-retained-handoffs"},bindings:{rpc,fs:{readFile:(path:string)=>readFile(join(root,path),"utf8"),readdir:(path:string)=>readdir(join(root,path),{withFileTypes:true}),stat:(path:string)=>stat(join(root,path))}}});
 try{const result=await runtime.runCell(async()=>{const n=runtime.ambient.natlang as {load(path:string,options:object):Promise<unknown>};const program=await n.load(programPath,{services}) as (goal:string)=>Promise<unknown>;return program(goal);},{runId:"TEST-only-retained-handoffs",signal:new AbortController().signal});expect(turns).toBe(codes.length);return result.value;}finally{runtime.close();}
}
it("generates the actual recovery declaration from its semantic entry and goal-aware replay helper",async()=>{
 const root="skills/open-session-recovery/program";
 const files=await readProjectFiles({readFile:(path:string)=>readFile(join(base,path),"utf8"),readdir:(path:string)=>readdir(join(base,path),{withFileTypes:true}),stat:(path:string)=>stat(join(base,path))},root);
 const compiled=compileProgram({platform:workerdPlatform({realm:confinedRealm(testNewFunction())}),files,entry:"recoverSessionGoal.nl",label:root,root});
 const declaration=compiled.declarations["recoverSessionGoal.d.nl.ts"]!;expect(declaration).toContain("readRecoveryWindows");expect(declaration).toContain("goal: string, sourceIds: string[]");expect(declaration).toContain("shouldRetainRecovery");
 const destination=process.env.VIBESTUDIO_RETAINED_HANDOFF_DECLARATIONS;if(destination){await mkdir(destination,{recursive:true});await writeFile(join(destination,"recoverSessionGoal.d.nl.ts"),declaration);}
},180000);
it("permits a stable provider observation once, with real output readback and an optional requested handoff",async()=>{
 const card={channelId:"native-owned",label:"Retained proof",request:{id:"request",provider:"Desk",operation:"proof",audience:"owners",revision:"v1"},owner:"owner",viewer:"device-workspace",mayStage:true};
 const rows=[{messageId:"grant",envelopeId:"g",seq:1,senderId:"host",record:{kind:"decision",request:card.request,owner:card.owner,state:"granted",hostRendered:true}},{messageId:"result",envelopeId:"r",seq:2,senderId:"provider",record:{kind:"result",request:card.request,state:"committed",digest:"native-digest"}}];
 const snapshot={channelId:card.channelId,through:2,rows};const output={digest:"native-digest",sha256:"native-digest",text:"Actual proof",bytes:12};let reads=0;const staged:unknown[]=[];
 const value=await invoke(base,"skills/open-user-goal/workOnProviderHandoffGoal.nl",{
  retainedConversationIndex:{list:async()=>[card]},retainedConversationState:{read:async(id:string)=>{expect(id).toBe(card.channelId);reads++;return snapshot;}},retainedProviderOutput:{read:async(id:string,message:string)=>{expect([id,message]).toEqual([card.channelId,"result"]);return output;}},retainedProviderHandoff:{stage:async(plan:any)=>{expect(plan.output).toEqual(output);expect(plan.through).toBe(snapshot.through);staged.push(plan);return{path:"/.tmp/native-handoff",sha256:"receipt",bytes:20};}},
 },[
  'const card=await chooseProviderConversation(goal,await workspace.discoverRetainedConversations());const history=await observeProviderHistory(goal,card,workspace.readProviderConversation);if(!history)throw Error("No actual observation");const output=await workspace.readProviderOutput(card.channelId,"result");const plan={channelId:card.channelId,through:history.current.through,requestId:card.request.id,decisionMessage:"grant",resultMessage:"result",disposition:"ready",reason:"verified",output,explanation:"The retained host grant and original committed proof match the exact request"};const handoff=await shouldStageProviderHandoff(goal,card)?await workspace.stageProviderHandoff(plan):null;return applicationResult(plan,handoff);',
  'return candidates[0];',
  'const opening=await read(card.channelId);if(!opening)return null;return {opening,current:opening};',
  'return true;',
 ],"Give the owners the retained proof and save its private handoff. Do not send another provider request.");
 expect(reads).toBe(1);expect(staged).toHaveLength(1);expect(value).toMatchObject({plan:{output},handoff:{path:"/.tmp/native-handoff"}});
},180000);
it("keeps editorial review read-only when no original attachment can be attested",async()=>{
 const mission={id:"packet",title:"Owned packet",revision:1,description:"Review",status:"current"};const document={path:"candidate.txt",version:"v1",text:"Existing text"};const snapshot={mission,candidate:document,attachments:[],preview:{...document,path:"preview.txt"},permittedFields:[]};let mutations=0;
 const value=await invoke(base,"skills/open-user-goal/workOnEditorialPacket.nl",{editorialMission:{list:async()=>[mission]},editorialWorkspace:{read:async(id:string)=>{expect(id).toBe(mission.id);return snapshot;}},editorialRevision:{read:async()=>document,apply:async()=>{mutations++;throw Error("No revision requested or approved");}},editorialHandoff:{stage:async()=>{mutations++;throw Error("No note requested");}}},[
  'const plan=await chooseEditorialMission(goal,await packet.listPacketMissions());const opening=await packet.readPacketSnapshot(plan.missionId);if(!opening)throw Error("Missing mission");const source=await reviewPacketSource(goal,opening,plan);const stored=await packet.readStoredPacket(plan.missionId);if(!stored)throw Error("No readback");const edit={proposed:null,revised:null,attempts:[],stored};const decision=await decideEditorialHandoff(goal,plan,opening,opening,[source],edit);return result(stored,decision,null);',
  'return {missionId:missions[0].id,operation:"review",fields:[],note:"none"};',
  'const selection=await chooseAttachmentPages(goal,snapshot,plan);if(selection!==null)throw Error("No approved attachment");return {selection:null,request:null,pdf:null,evidence:null};',
  'return null;',
  'return {status:"held",write:false,explanation:"The stored candidate exists, but there is no approved attachment supporting a correction"};',
 ],"Review this packet and tell me what can be verified. Do not revise or leave a note.");
 expect(mutations).toBe(0);expect(value).toMatchObject({document:{path:document.path,version:document.version},decision:{status:"held",write:false},note:null});
},180000);
for(const partial of [false,true])it(`recovers independently grouped source windows and ${partial?"holds incomplete evidence without staging":"retains the actual requested complete handoff"}`,async()=>{
 const sources=[{id:"primary",title:"Primary",description:"Current record"},{id:"comparison",title:"Comparison",description:"Earlier copy"}];const notes=sources.map((source,i)=>({channelId:source.id,messageId:"message-"+source.id,seq:i+1,text:"Native retained "+source.id}));const reads:string[]=[],artifacts:unknown[]=[];
 const windows=sources.map((source,i)=>({source,saved:{channelId:source.id,seq:0},status:partial&&i===0?"partial":"complete",frontier:i+1,next:{channelId:source.id,seq:i+1},notes:[notes[i]]}));
 const value=await invoke(base,"skills/open-session-recovery/program/recoverSessionGoal.nl",{recoverySessions:{discover:async()=>sources},recoveryReplay:{resume:async(id:string)=>{reads.push(id);const window=windows.find(w=>w.source.id===id);if(!window)throw Error("Foreign source");return window;}},recoveryHandoff:{stage:async(review:any)=>{expect(partial).toBe(false);expect(review.citations).toEqual(notes);artifacts.push(review);return{path:"/.tmp/recovery",sha256:"native",citationIds:notes.map(n=>n.messageId)};}}},[
  'const sources=await recoverySessions.discover();const ids=await chooseRecoverySources(goal,sources);const windows=await readRecoveryWindows(goal,ids);const review=await interpretRecovery(goal,windows);const requested=await shouldRetainRecovery(goal);const handoff=requested?await stageRecoveryHandoff(review):null;return {review,handoff};',
  'return sources.map(source=>source.id);',
  'const windows=await Promise.all(sourceIds.map(id=>recoveryReplay.resume(id)));await recoveryReplay.resume(sourceIds[0]);return windows;',
  partial?'return {disposition:"incomplete",reason:"The primary replay has incomplete coverage",citations:[]};':'const citations=await selectRecoveryCitations(goal,"continue",windows);return {disposition:"continue",reason:"Both complete native windows support continuation",citations};',
  ...partial?[]:['return windows.flatMap(window=>window.notes);'],
  'return true;',
  'if(review.disposition!=="continue"&&review.disposition!=="hold")return null;return recoveryHandoff.stage(review);',
 ],"Compare the primary record with the earlier copy, explain what can safely continue, and retain the finding only when supported by complete evidence.");
 expect(reads).toEqual(["primary","comparison","primary"]);expect(artifacts).toHaveLength(partial?0:1);expect(value).toMatchObject({review:{disposition:partial?"incomplete":"continue"},handoff:partial?null:{path:"/.tmp/recovery"}});
},180000);
