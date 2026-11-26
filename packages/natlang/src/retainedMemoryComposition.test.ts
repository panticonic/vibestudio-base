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
 let turns=0;const {rpc}=fakeRpc({turn:async(input)=>{if(process.env.VIBESTUDIO_RETAINED_MEMORY_TEST_PROGRESS)await appendFile(process.env.VIBESTUDIO_RETAINED_MEMORY_TEST_PROGRESS,JSON.stringify({programPath,turn:turns})+"\n");const code=codes[turns++];if(!code){const messages=(input.context as {messages?:{role?:string;isError?:boolean;content?:unknown}[]}).messages??[];throw Error("Unexpected semantic turn; context shape "+JSON.stringify({inputKeys:Object.keys(input),contextKeys:Object.keys(input.context??{}),roles:messages.map(m=>m.role)})+"; actual tool results: "+JSON.stringify(messages.filter(message=>message.role==="toolResult").slice(0,2).map(message=>JSON.stringify(message.content).slice(0,1600))));}return toolCallMessage("eval",typeof code==="string"?{code,finish:true}:code,{input:0,output:0});}});
 const runtime=createEvalNatlang({newFunction:testNewFunction(),owner:{kind:"user",objectKey:"TEST-only-retained-memory"},bindings:{rpc,fs:{readFile:(path:string)=>readFile(join(root,path),"utf8"),readdir:(path:string)=>readdir(join(root,path),{withFileTypes:true}),stat:(path:string)=>stat(join(root,path))}}});
 try{const result=await runtime.runCell(async()=>{const n=runtime.ambient.natlang as {load(path:string,options:object):Promise<unknown>};const program=await n.load(programPath,{services}) as (goal:string)=>Promise<unknown>;return program(goal);},{runId:"TEST-only-retained-memory",signal:new AbortController().signal});expect(turns).toBe(codes.length);return result.value;}finally{runtime.close();}
}

for(const retain of [false,true])it(`executes the actual memory hierarchy with async reader capabilities and ${retain?"a requested native note":"no unsolicited write"}`,async()=>{
 const brief={subject:"Owned memory",channelId:"owned-channel",repository:"projects/owned"};const messages=[{channelId:brief.channelId,envelopeId:"native-envelope",messageId:"native-message",sender:"owner",sequence:1,text:"The original decision was north desk."}];let reads=0,writes=0;
 const value=await invoke(base,"skills/open-user-goal/reviewRetainedMemory.nl",{nativeRetainedMemory:{brief:async()=>brief,recall:async()=>[],transcript:async(id:string)=>{expect(id).toBe(brief.channelId);reads++;await Promise.resolve();return messages;},archivedFile:async()=>null,workingFile:async()=>null},nativeMemoryHandoff:{stage:async(b:unknown,p:unknown,e:any,o:any)=>{expect(retain).toBe(true);expect(b).toEqual(brief);expect(e.messages).toEqual(messages);expect(o.citations[0].coordinate).toBe(messages[0].messageId);writes++;return{path:"/.tmp/actual-note",digest:"native-digest"};}}},[
 'const brief=await evidence.identifyMemoryScope();const investigation=await investigateRetainedMemory(goal,brief,{recall:evidence.recallMemoryLeads,transcript:evidence.readMemoryMessages,archivedFile:evidence.readMemoryArchive,workingFile:evidence.readMemoryDraft});const outcome=await judgeMemoryClaim(goal,investigation.plan,investigation.evidence);const retain=await shouldRetainMemoryFinding(goal,brief,outcome);const handoff=retain?await evidence.stageMemoryHandoff(brief,investigation.plan,investigation.evidence,outcome):null;return applicationResult(outcome,handoff);',
 'const plan=await chooseMemorySearch(goal,brief);const messages=await readers.transcript(brief.channelId);await readers.transcript(brief.channelId);return {plan,evidence:{leads:[],messages,committed:[],working:null}};',
 'return {query:"owned decision",kinds:["message"],readTranscript:true,readWorking:false};',
 'return {disposition:"original conversation",summary:"The original says north desk",citations:evidence.messages.map(m=>({layer:"message",ref:m.envelopeId,coordinate:m.messageId,quote:m.text}))};',
 retain?'return true;':'return false;',
 ],retain?"Recover the original decision and leave a private note.":"Tell me the original decision without writing a note.");
 expect(reads).toBe(2);expect(writes).toBe(retain?1:0);expect(value).toMatchObject({outcome:{summary:"The original says north desk"},handoff:retain?{path:"/.tmp/actual-note"}:null});
},180000);
