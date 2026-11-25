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
it("lets the asset root answer stable-identity questions without copying, archive reads or private status echoes",async()=>{
 const manifest={bundle:"Owned sample",edition:"approved",release:"verified",assets:[{key:"sample",path:"sample.bin",digest:"a".repeat(64),mode:420,output:"sample.bin"}]};
 const approved={id:"approved-event",edition:"approved",bundle:manifest.bundle,dossier:"manifest"},working={id:"working-head",edition:"working",bundle:manifest.bundle,dossier:"manifest"};
 const file={id:"original",path:"sample.bin",digest:"a".repeat(64),mode:420,size:2,type:"bytes"},replacement={...file,id:"replacement",digest:"b".repeat(64)},dossier={id:"manifest",path:"release-manifest.json",digest:"c".repeat(64),mode:420,size:200,type:"text"};
 const reads:string[]=[];let copies=0;
 const answer="The retained original is no longer present in the working state; another stable file identity now occupies its old pathname. No recovery was authorized or performed.";
 const result=await invoke(base,"skills/open-user-goal/reviewAssetIntegrity.nl",{assetHistory:{discover:async()=>[approved,working],listFiles:async(id:string)=>{reads.push(id);return [id===approved.id?file:replacement,dossier];},inspect:async(id:string,key:string)=>({...((key===dossier.id)?dossier:id===approved.id?file:replacement),manifest:key===dossier.id?{...manifest,edition:id===approved.id?"approved":"working"}:null})},assetRecovery:{stage:async()=>{copies++;throw Error("No copy authority");}}},[
 'const cards=await discoverVersions();const versions=[];for(const card of cards)versions.push(await readVersion(card));const approved=versions.find(row=>row.version.edition==="approved");const working=versions.find(row=>row.version.edition==="working");const findings=[await compareAsset(approved.manifest.assets[0],approved,working)];return {finding:await explainAssetFinding(goal,versions,findings,null),recovery:null};',
 ...[0,1].map(()=> 'const files=await listFiles(version.id);const inspected=[];for(const file of files)inspected.push(await inspectFile(version.id,file.id));return {version,files,manifest:inspected.find(file=>file.manifest!==null).manifest,inspected};'),
 'return {key:claim.key,retained:approved.inspected[0].id,working:working.inspected[0].id,differences:["replaced"]};',
 'return '+JSON.stringify(answer)+';',
 ],"Check whether the old sample pathname still names the same accepted file. Do not restore anything.");
 expect(result).toEqual({finding:answer,recovery:null});expect(reads).toEqual([approved.id,working.id]);expect(copies).toBe(0);
},180000);
