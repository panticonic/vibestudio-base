/** Scripted gateway only: actual parser/evaluator and native-port wiring, no model/provider/network. */
import {expect,it} from "vitest";
import {readFile,readdir,stat} from "node:fs/promises";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {createEvalNatlang} from "./index.js";
import {fakeRpc,testNewFunction,toolCallMessage} from "./testSupport.js";
const root=fileURLToPath(new URL("../../..",import.meta.url));
it.each([{name:"no edit grant",mayEdit:false,mayTest:true},{name:"edit grant is not a requested mutation",mayEdit:true,mayTest:true},{name:"native tests unavailable",mayEdit:false,mayTest:false}])("composes requested diagnostics from actual observations: $name",async scenario=>{
 const app={id:"owned-app",path:"terminal-apps/owned",title:"Observed app",ownership:"current",mayEdit:scenario.mayEdit,mayTest:scenario.mayTest};
 const check={observed:{revision:"native-revision",stateHash:"native-state",buildStatus:"ok",diagnostics:[],paths:[app.path+"/index.ts"],sources:[{path:app.path+"/index.ts",text:"export function total(count:number){return count+1;}"}]},tests:scenario.mayTest?{revision:"native-revision",stateHash:"native-state",runtime:"native",status:"failed",suite:"unit",artifactKey:"actual-native-test",executionDigest:"actual-native-digest",passed:0,failed:1,total:1,details:[{file:app.path+"/index.test.ts",status:"fail",errors:["expected 4 to equal 3"]}]}:null};
 let turns=0,reads=0,lists=0,writes=0,finals=0,artifacts=0;
 const codes=[
  'const app=await findTerminalApp(goal);const check=await observeTerminalApp(app.id);return {app,check};',
  'const rows=await terminalRepairCatalog.list();return rows[0];',
  'const scope=await judgeRepairScope(app,check);const explanation=await explainTerminalObservation(goal,app,check);return {status:"diagnosed",edits:[],reason:explanation};',
  `return ${JSON.stringify(!scenario.mayTest?"hold-test":scenario.mayEdit?"repair":"hold-edit")};`,
  'return JSON.stringify({source:check.observed.sources[0].text,failures:check.tests?.details??[],mayEdit:app.mayEdit});',
 ];
 const {rpc}=fakeRpc({turn:async()=>{const code=codes[turns++];if(!code)throw Error("Unexpected additional semantic turn");return toolCallMessage("eval",{code,finish:true},{input:0,output:0});}});
 const runtime=createEvalNatlang({newFunction:testNewFunction(),owner:{kind:"user",objectKey:"terminal-diagnostic-component"},bindings:{rpc,fs:{readFile:(path:string)=>readFile(join(root,path),"utf8"),readdir:(path:string)=>readdir(join(root,path),{withFileTypes:true}),stat:(path:string)=>stat(join(root,path))}}});
 try{
  const result=await runtime.runCell(async()=>{
   const natlang=runtime.ambient.natlang as {load(path:string,options:object):Promise<unknown>};
   const module=await natlang.load("skills/open-user-goal/workOnTerminalApp.ts",{services:{terminalRepairCatalog:{list:async()=>{lists++;return [app];}},terminalRepairObserve:{read:async(id:string)=>{expect(id).toBe(app.id);reads++;return check;}},terminalRepairApply:{edit:async()=>{writes++;throw Error("No edit was requested");}},terminalRepairFinal:{verify:async()=>{finals++;throw Error("No extra execution was requested");}},terminalRepairArtifact:{read:async()=>{artifacts++;throw Error("No artifact was requested");}}}}) as {default:(goal:string)=>Promise<{outcome:string;artifact:unknown;explanation:string}>};
   return module.default("Explain the observed count discrepancy from actual source and available native tests. Keep source unchanged.");
  },{runId:"terminal-diagnostic-component",signal:new AbortController().signal});
  expect(result.value.outcome).toBe("diagnosed");expect(result.value.artifact).toBeNull();
  expect(JSON.parse(result.value.explanation)).toEqual({source:check.observed.sources[0].text,failures:check.tests?.details??[],mayEdit:scenario.mayEdit});
  expect({lists,reads,writes,finals,artifacts}).toEqual({lists:1,reads:1,writes:0,finals:0,artifacts:0});expect(turns).toBe(codes.length);
 }finally{runtime.close();}
},180000);
