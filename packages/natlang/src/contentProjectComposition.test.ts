/** Real joint loader/evaluator, scripted semantic turns and native port mocks; no model/provider or filesystem project build. */
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
function native(){
 const evidence={title:"Private shift",repoPath:"projects/shift",audience:"Operators",documentRoles:["Procedure"],revision:"source-current",occupied:false,records:[{id:"requirements",path:"source.md",fileId:"file",digest:"native-digest",edition:"current",purpose:"requirements",facts:[{id:"required-step",text:"Inspect the actual signed slip."}],localApproval:null}]};
 const prepared={contextId:"ctx",repoPath:evidence.repoPath,repositoryId:"repo",head:"prepared",mainEventId:"main",committedEventId:"before",clean:false,files:[] as {path:string;text:string}[]};
 const scope={status:"admitted",receipt:"actual-native-scope",initialHead:"before",request:{goal:"Retain an uncommitted private draft.",audience:evidence.audience,facts:[{id:"required-step",text:"Inspect the actual signed slip."}],documentRoles:evidence.documentRoles}};
 let candidate={...prepared};let commits=0,prepares=0;const decisions:unknown[]=[];
 const services={contentProjectSources:{observe:async()=>evidence},contentProjectScope:{confirm:async(revision:string,decision:unknown)=>{expect(revision).toBe(evidence.revision);decisions.push(decision);return scope;}},contentProjectDraft:{prepare:async(receipt:string,head:string)=>{expect([receipt,head]).toEqual([scope.receipt,"before"]);prepares++;return prepared;},write:async(receipt:string,head:string,files:{path:string;text:string}[])=>{expect([receipt,head]).toEqual([scope.receipt,"prepared"]);candidate={...prepared,head:"written",files};return candidate;},observe:async(receipt:string)=>{expect(receipt).toBe(scope.receipt);return candidate;}},contentProjectCommit:{commit:async()=>{commits++;throw Error("No commit authorized by this goal");}}};
 return {services,evidence,scope,decisions,state:()=>({commits,prepares,candidate})};
}
const review='const evidence=await readOwnedProjectSources();const semantic=asDispositionEvidence(evidence);const choice=await chooseProjectDisposition(goal,semantic);return {evidence,decision:bindChosenDisposition(evidence,choice)};';
it("owns hierarchical source interpretation, actual native draft creation and semantic finish decisions",async()=>{
 const n=native();const result=await invoke(base,"skills/open-user-goal/prepareContentProject.nl",n.services,[
 'const reviewed=await reviewProjectEvidence(goal);const scope=await confirmProjectScope(reviewed.evidence,reviewed.decision);const draft=await authorProjectDocuments(scope);const finished=await finishPrivateProject(reviewed.decision,scope,draft);return projectResult(finished);',
 review,
 'return {action:"draft",basis:"authorized",selected:[0],reason:"The current source supports the requested uncommitted procedure."};',
 'const snapshot=await writeInitialProject(scope,[{path:"README.md",text:"# Procedure\\nInspect the actual signed slip."}]);if(!snapshot) return null;const retained=await readProjectCandidate(scope);if(!retained) return null;return {snapshot:retained,review:{ready:true,coveredRoles:["Procedure"],unsupportedClaims:[],blockers:[],reason:"Reviewed the actual retained procedure."}};',
 'return {outcome:"draft",candidate:draft===null?null:draft.snapshot,event:null};',
 ],"Retain an uncommitted private procedure from the current signed source.");
 expect(n.decisions).toEqual([{action:"draft",basis:"authorized",selected:[{source:"requirements",digest:"native-digest",fact:"required-step"}],reason:"The current source supports the requested uncommitted procedure."}]);
 expect(result).toEqual({outcome:"draft",project:{contextId:"ctx",repositoryId:"repo",repoPath:"projects/shift",head:"written",documents:["README.md"]},event:null});
 expect(n.state().commits).toBe(0);expect(n.state().prepares).toBe(1);
},180000);
it("lets the semantic root preserve an evidence hold without opening a private project or acquiring an unused scope",async()=>{
 const n=native();const result=await invoke(base,"skills/open-user-goal/prepareContentProject.nl",n.services,[
 'const reviewed=await reviewProjectEvidence(goal);if(reviewed.decision.action!=="hold")throw Error("Expected actual evidence hold");return projectResult({outcome:"held",candidate:null,event:null});',review,
 'return {action:"hold",basis:"pending",selected:[],reason:"No local creation approval is established."};',
 ],"Create the private project only with current signed creation approval.");
 expect(result).toEqual({outcome:"held",project:null,event:null});expect(n.decisions).toEqual([]);expect(n.state().prepares).toBe(0);expect(n.state().commits).toBe(0);
},180000);
