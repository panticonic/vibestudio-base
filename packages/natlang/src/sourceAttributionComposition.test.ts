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
it("loads the actual hierarchical attribution entry and carries independent native file/lineage evidence into its requested conclusion",async()=>{
 const candidates=[{id:"main",name:"main/cap.txt",path:"main/cap.txt"},{id:"satellite",name:"satellite/cap.txt",path:"satellite/cap.txt"}];
 const assignment={id:"owned-assignment",scope:"owned-source",goal:"Explain whether the satellite value was decided there or copied from main.",mayRetain:false,candidates};
 const calls:string[]=[];
 const files=candidates.map(candidate=>({candidate,state:"native-current",file:"file:"+candidate.id,coordinateKind:"utf16",digest:"native-bytes-"+candidate.id,fragments:[{id:"value",start:0,end:5,text:"cap=3"}]}));
 const result=await invoke(base,"skills/open-user-goal/reviewSourceAttribution.nl",{
  sourceOriginEvidence:{discover:async()=>assignment,read:async(id:string,candidate:string)=>{expect(id).toBe(assignment.id);calls.push("read:"+candidate);return files.find(file=>file.candidate.id===candidate)??null;}},
  sourceOriginGraph:{trace:async(id:string,state:string,candidate:string,fragment:string)=>{
   expect([id,state,fragment]).toEqual([assignment.id,"native-current","value"]);expect(calls).toContain("read:"+candidate);calls.push("trace:"+candidate);
   return {file:"file:"+candidate,state,fragment,spans:[{id:"span:"+candidate,start:0,end:5,boundary:"authored",intentTier:"stated",paths:["main/cap.txt"],work:"work:cap",command:"command:copy",externalSource:null}],truncated:false};
  },inspect:async(id:string,ref:string)=>{expect(id).toBe(assignment.id);expect(ref).toBe("work:cap");calls.push("inspect:"+ref);return {ref,kind:"work",label:"Cap decision",intent:"Set cap to three at main",tier:"stated",externalSource:null};}},
  sourceOriginReceipt:{retain:async()=>{throw Error("Read-only question must not fabricate persistence");}},
 },[
  'const assignment=await discoverSourceAttribution();const investigation=await investigateSourceEvidence(assignment);const conclusion=await explainSourceOrigin(goal,investigation.files,investigation.evidence);return {conclusion,receipt:null};',
  'const ids=await selectCandidates(assignment);const observed=await Promise.all(ids.map(id=>inspectCurrentSource(assignment,id)));const files=observed.filter(file=>file!==null);const selections=await selectFragments(assignment,files);const evidence=[];for(const selected of selections){const file=files.find(file=>file.candidate.id===selected.candidate);if(!file)throw Error("No observed current file");evidence.push(await traceSelectedSource(assignment,file,selected));}return {files,evidence};',
  'return assignment.candidates.map(candidate=>candidate.id);',
  'return await readOwnedFile(assignment,candidate);',
  'return await readOwnedFile(assignment,candidate);',
  'return files.map(file=>({candidate:file.candidate.id,fragment:file.fragments[0].id}));',
  'const trace=await content.traceOwnedRange(assignment,file,selected);const roots=[];for(const span of trace.spans)if(span.work)roots.push(await intent.inspectOwnedRoot(assignment,span.work));return {selected,trace,roots};',
  'const trace=await content.traceOwnedRange(assignment,file,selected);const roots=[];for(const span of trace.spans)if(span.work)roots.push(await intent.inspectOwnedRoot(assignment,span.work));return {selected,trace,roots};',
  'return {disposition:"supported",claims:evidence.flatMap(item=>item.trace.spans.map(span=>({fragment:item.selected.fragment,span:span.id,origin:"native",intent:item.roots[0].intent,refs:item.roots.map(root=>root.ref)})))};',
 ],assignment.goal);
 expect(calls.filter(call=>call.startsWith("read:"))).toEqual(["read:main","read:satellite"]);
 expect(calls.filter(call=>call.startsWith("trace:"))).toEqual(["trace:main","trace:satellite"]);
 expect(result).toMatchObject({conclusion:{disposition:"supported",claims:[{intent:"Set cap to three at main",refs:["work:cap"]},{intent:"Set cap to three at main",refs:["work:cap"]}]},receipt:null});
},180000);
