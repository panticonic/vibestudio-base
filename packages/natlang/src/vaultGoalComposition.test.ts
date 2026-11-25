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
it("composes knowledge from two real source views and exact navigation feedback across semantic turns",async()=>{
 const root=process.env.VIBESTUDIO_VAULT_COMPOSITION_ROOT!;const a={path:"Index.mdx",revision:"a",source:"Current ruling is linked below.",visible:"Current ruling",links:[{target:"Ruling",path:"records/Ruling.mdx"}]},b={path:"records/Ruling.mdx",revision:"b",source:"Confirmed capacity: 14.",visible:"Capacity 14",links:[]};let current=a;const followed:unknown[]=[];
 const result=await invoke(root,"skills/spectrolite-review/workOnVaultKnowledgeGoal.nl",{vaultKnowledgeHandoff:{stage:async()=>{throw Error("No requested handoff");}},spectroliteRead:{observe:async()=>{throw Error("No requested standalone review");}},spectroliteHandoffRead:{evidence:async()=>{throw Error("No requested handoff read");}},spectroliteGoal:{evidence:async()=>{throw Error("No requested extra review");},inspect:async()=>current,follow:async(target:string,revision:string)=>{expect([target,revision]).toEqual(["Ruling","a"]);followed.push([target,revision]);current=b;return "followed";},revise:async()=>{throw Error("No requested mutation");}}},[
 {code:'let current=await readCurrentVault();let history=retainObservation({views:[],operations:[]},current,null);const step=await chooseKnowledgeStep(goal,current,[],[],false,history);if(step.kind!=="follow"&&step.kind!=="revise")throw Error("Expected a native change proposal");const changed=await applyChange(current,step);current=changed.current;history=retainObservation(history,current,changed.observation);',finish:false},
 'return {kind:"follow",target:current.links[0].path};',
 'return knowledgeResult(await summarizeKnowledgeWork(goal,current,[],[],null,history),current,[],null);',
 'return {outcome:"authority-confirmed",authorityPath:history.views[1].path,answer:history.views[1].source};',
 ],"What is the confirmed capacity? Use the actual current ruling, and do not edit it.");
 expect(followed).toEqual([["Ruling","a"]]);expect(result).toMatchObject({path:b.path,revision:"b",reads:[],answer:b.source,handoff:null});
},180000);
it("lets the vault goal interpret an unavailable native navigation without inventing a review or write",async()=>{
 const root=process.env.VIBESTUDIO_VAULT_COMPOSITION_ROOT!;const view={path:"Index.mdx",revision:"owned",source:"The ruling is not reachable.",visible:"Unavailable ruling",links:[]};let writes=0;const followed:unknown[]=[];
 const result=await invoke(root,"skills/spectrolite-review/workTowardVaultGoal.nl",{vaultKnowledgeHandoff:{stage:async()=>{throw Error("No requested handoff");}},spectroliteRead:{observe:async()=>{throw Error("No requested standalone review");}},spectroliteHandoffRead:{evidence:async()=>{throw Error("No requested handoff read");}},spectroliteGoal:{evidence:async()=>{throw Error("No requested extra review");},inspect:async()=>view,follow:async(target:string,revision:string)=>{followed.push([target,revision]);return "unavailable";},revise:async()=>{writes++;return "unavailable";}}},[
 'const current=await readCurrentVault();let history=retainObservation({views:[],operations:[]},current,null);const next=await chooseVaultStep(goal,current,history,false);if(next.kind!=="follow"&&next.kind!=="revise")throw Error("Expected a native change proposal");const result=await applyChange(current,next);history=retainObservation(history,result.current,result.observation);const final=await chooseVaultStep(goal,result.current,history,false);if(final.kind!=="blocked")throw Error("Expected actual inaccessible-evidence finding");return {status:"blocked",reason:final.reason};',
 'return {kind:"follow",target:"missing"};',
 'return {kind:"blocked",reason:"The native navigation returned "+history.operations[0].result+"; the ruling has not been observed."};',
 ],"Review the actual ruling without changing the vault.");
 expect(followed).toEqual([["missing",view.revision]]);expect(writes).toBe(0);expect(result).toMatchObject({status:"blocked",reason:"The native navigation returned unavailable; the ruling has not been observed."});
},180000);
