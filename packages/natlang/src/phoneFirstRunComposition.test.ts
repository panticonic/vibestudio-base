/** Actual joint compiler/evaluator with scripted semantics and native-port mocks.
 * No paid provider, native compiler/build or DOM renderer is executed. */
import {expect,it} from "vitest";
import {readFile,readdir,stat} from "node:fs/promises";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {createEvalNatlang} from "./index.js";
import {fakeRpc,testNewFunction,toolCallMessage} from "./testSupport.js";
const base=fileURLToPath(new URL("../../..",import.meta.url));
async function invoke(root:string,programPath:string,services:Record<string,unknown>,codes:(string|{code:string;finish:boolean})[],goal:string){
 let turns=0;const {rpc}=fakeRpc({turn:async(input)=>{const code=codes[turns++];if(!code){const messages=(input.context as {messages?:{role?:string;isError?:boolean;content?:unknown}[]}).messages??[];throw Error("Unexpected semantic turn; context shape "+JSON.stringify({inputKeys:Object.keys(input),contextKeys:Object.keys(input.context??{}),roles:messages.map(m=>m.role)})+"; actual tool results: "+JSON.stringify(messages.filter(message=>message.role==="toolResult").slice(0,2).map(message=>JSON.stringify(message.content).slice(0,1600))));}return toolCallMessage("eval",typeof code==="string"?{code,finish:true}:code,{input:0,output:0});}});
 const runtime=createEvalNatlang({newFunction:testNewFunction(),owner:{kind:"user",objectKey:"domain-composition"},bindings:{rpc,fs:{readFile:(path:string)=>readFile(join(root,path),"utf8"),readdir:(path:string)=>readdir(join(root,path),{withFileTypes:true}),stat:(path:string)=>stat(join(root,path))}}});
 try{const result=await runtime.runCell(async()=>{const n=runtime.ambient.natlang as {load(path:string,options:object):Promise<unknown>};const program=await n.load(programPath,{services}) as (goal:string)=>Promise<unknown>;return program(goal);},{runId:"domain-composition",signal:new AbortController().signal});expect(turns).toBe(codes.length);return result.value;}finally{runtime.close();}
}
it("composes a first-run sign-off answer from assigned shell phases without pairing or an enum report",async()=>{
 const card={id:"current-phone",title:"Shift Phone",edition:"current"};
 const assignment={id:card.id,targetId:"assigned-phone",platform:"android",mode:"release",paired:"none",installed:"absent",desktops:[{providerId:"linux-release",label:"Assigned desktop",supportsSource:false}],setupRequest:null};
 const startup={id:card.id,status:"await-connection",observedConnection:false,observedShell:true,observedPanel:false,issues:[]};
 const build={id:card.id,revision:"source-head",client:"clients/mobile-browser",runtime:"react-native",abi:"4",expectedAbi:"4",provider:"extensions/react-native",providerPackage:"@workspace-extensions/react-native",manifestDigest:"a",clientDigest:"b"};
 const read:string[]=[];let mutations=0;
 const service={discover:async()=>[card],inspect:async(id:string)=>{expect(id).toBe(card.id);read.push("assignment");return assignment;},phases:async(id:string)=>{expect(id).toBe(card.id);read.push("phases");return startup;},provider:async(id:string)=>{expect(id).toBe(card.id);read.push("provider");return build;}};
 const answer="No. Only the shell marker was observed; the connection and panel still require verification on the assigned desktop. This does not sign off a physical phone.";
 const result=await invoke(base,"skills/open-user-goal/planPhoneFirstRun.nl",{phoneFirstRun:service,phoneSetupPair:{provision:async()=>{mutations++;throw Error("Not permitted");}}},[
 'const card=await locatePhoneRehearsal(goal);const evidence=await readPhoneEvidence(card.id);return explainPhoneFirstRun(goal,{card,...evidence,resume:null});',
 'return (await phoneFirstRun.discover())[0];',
 'return {assignment:await readSetupAssignment(id),startup:await readStartupPhases(id),build:await readBuildProvider(id)};',
 'return '+JSON.stringify(answer)+';',
 ],"Can a shell-ready marker alone sign off this phone? Separate observed phases from what still needs verification on the assigned desktop.");
 expect(result).toBe(answer);expect(read).toEqual(["assignment","phases","provider"]);expect(mutations).toBe(0);
},180000);
