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
it("composes the requested mobile finding through current-profile observations without archive reads or action tags",async()=>{
 const profile={id:"owned-current",title:"Line Check",workspace:"Label Printing",device:"handset",edition:"current",server:"current-server",packageName:"app.vibestudio.mobile.internal",adbState:"ready",expectedBuild:"build"};
 const observed:string[]=[];
 const evidence={build:{id:"build",clientSource:"clients/mobile-browser",declaredAbi:"4",providerSource:"extensions/react-native",clientManifestDigest:"c",providerManifestDigest:"p",artifactIntegrity:null,expectedBuild:"build",observedBuild:"build",granted:[],failed:[]},cache:{id:"cache",status:"loaded",preferredSlot:"panel:tree/overview",treeRevision:10,removedBadRecord:false},transport:{id:"transport",state:"connected",opens:1,recovered:[],caller:null,server:null,error:null,transient:null,failureKind:null},routes:{id:"routes",owned:["panel:tree/notes"],lost:["panel:tree/overview"],unleased:[],invalidated:[]}};
 const services={mobileContinuity:{discover:async()=>[profile],profile:async(id:string)=>{expect(id).toBe(profile.id);observed.push("profile");return profile;},...Object.fromEntries(Object.entries(evidence).map(([method,value])=>[method,async(id:string)=>{expect(id).toBe(profile.id);observed.push(method);return value;}]))}};
 const answer="The overview is owned elsewhere, so you cannot keep using it here without taking it back. Leave the other client's ownership unchanged; the cached view does not establish current route authority.";
 const result=await invoke(base,"skills/open-user-goal/reviewMobileContinuity.nl",services,[
 'const profile=await selectProfile(goal);const evidence=await auditContinuity(profile.id);return explainContinuity(goal,profile,evidence);',
 'const profiles=await listProfiles();return readProfile(profiles[0].id);',
 'return {build:await readBuild(id),cache:await readCache(id),transport:await readTransport(id),routes:await readRoutes(id)};',
 'return '+JSON.stringify(answer)+';',
 ],"Inspect this handset and tell me whether I can keep using its overview without taking it back.");
 expect(result).toBe(answer);expect(observed).toEqual(["profile","build","cache","transport","routes"]);
},180000);
