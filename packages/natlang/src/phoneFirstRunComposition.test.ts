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
 try{const result=await runtime.runCell(async()=>{const n=runtime.ambient.natlang as {load(path:string,options:object):Promise<unknown>};const program=await n.load(programPath,{services}) as (goal:string)=>Promise<unknown>;return program(goal);},{runId:"domain-composition",signal:new AbortController().signal});expect(turns).toBe(codes.length);return result.value;}finally{await runtime.close();}
}
for(const mode of ["phases","package","refinement"] as const)it(`composes a goal-aware phone inquiry with actual selected observations: ${mode}`,async()=>{
 const card={id:"current-phone",title:"Shift Phone",edition:"current"};
 const assignment={id:card.id,targetId:"assigned-phone",platform:"android",mode:"release",paired:"none",installed:mode==="package"?"release":"absent",desktops:[{providerId:"linux-release",label:"Assigned desktop",supportsSource:false}],setupRequest:null};
 const startup={id:card.id,status:"await-connection",observedConnection:false,observedShell:true,observedPanel:false,issues:[]};
 const later={...startup,status:"complete",observedConnection:true,observedPanel:true};
 const reads:string[]=[];let phaseReads=0,mutations=0;
 const service={discover:async()=>[card],inspect:async(id:string)=>{expect(id).toBe(card.id);reads.push("assignment");return assignment;},phases:async(id:string)=>{expect(id).toBe(card.id);reads.push("phases");return ++phaseReads===1?startup:later;},provider:async()=>{reads.push("provider");throw Error("The selected inquiry does not need a provider read");}};
 const answer=mode==="package"?"The release package is retained. Pair it using the eligible desktop next and then establish connection, without reinstalling or requesting a source build.":mode==="refinement"?"The initial shell-only observation was not ready; the later native observation includes connection and panel. This is observed rehearsal evidence, not a claim about a physical phone.":"No. Only the shell marker was observed; connection and panel still need verification. This does not sign off a physical phone.";
 const inquiry=mode==="package"?'return {card,assignment:await readSetupAssignment(card.id),startup:null,build:null,resume:null};':'return {card,assignment:await readSetupAssignment(card.id),startup:await readStartupPhases(card.id),build:null,resume:null};';
 const root=mode==="refinement"?'const card=await locatePhoneRehearsal(goal);const first=await readPhoneEvidence(goal,card,null);const current=await readPhoneEvidence(goal,card,first);return explainPhoneFirstRun(goal,current,first);':'const card=await locatePhoneRehearsal(goal);const current=await readPhoneEvidence(goal,card,null);return explainPhoneFirstRun(goal,current,null);';
 const codes=[root,'return (await phoneFirstRun.discover())[0];',inquiry];
 if(mode==="refinement")codes.push('if(!previous||previous.startup?.observedConnection!==false)throw Error("Actual earlier evidence was not supplied");'+inquiry);
 codes.push(mode==="refinement"?'if(!previous||previous.startup?.observedConnection!==false||evidence.startup?.observedConnection!==true)throw Error("Missing before/after observations");return '+JSON.stringify(answer)+';':'return '+JSON.stringify(answer)+';');
 const result=await invoke(base,"skills/open-user-goal/planPhoneFirstRun.nl",{phoneFirstRun:service,phoneSetupPair:{provision:async()=>{mutations++;throw Error("Not permitted");}}},codes,mode==="package"?"Explain the next step for the already retained release package without reinstalling.":mode==="refinement"?"Recheck the observation and explain what changed before signing off.":"Can the shell-ready marker alone sign off this phone?");
 expect(result).toBe(answer);expect(mutations).toBe(0);expect(reads).toEqual(mode==="package"?["assignment"]:mode==="refinement"?["assignment","phases","assignment","phases"]:["assignment","phases"]);
},180000);
