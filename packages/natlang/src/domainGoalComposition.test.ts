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
it("lets assembly discover transitive requirements over two semantic expansions before an actual authorized build and draft",async()=>{
 const head={kind:"event",eventId:"native-head"};const units=["reader","formatter","normalize"].map(id=>({id,label:id,role:"workspace",repoPath:"packages/"+id,packageName:"@owned/"+id}));
 const inventory={head,reviewed:head,units,allowedBuilds:["reader"],mayStage:true,note:"Use the supported formatter with its source requirements"};
 const reads:string[]=[],builds:string[]=[],staged:unknown[]=[];
 const result=await invoke(base,"skills/open-user-goal/workOnAssemblyGoal.nl",{
  assemblyInventory:{observe:async()=>inventory},
  assemblySource:{read:async(id:string,state:unknown)=>{expect(state).toEqual(head);const unit=units.find(unit=>unit.id===id);if(!unit)return null;reads.push(id);return {unit,head,manifestSha:"native-manifest-"+id,files:[{path:"index.ts",text:id==="reader"?'import {format} from "@owned/formatter";':id==="formatter"?'import {normalize} from "@owned/normalize";':"export const normalize=String;",contentHash:"native-content-"+id}]};}},
  assemblyBuild:{verify:async(id:string,state:unknown)=>{expect(state).toEqual(head);expect(inventory.allowedBuilds).toContain(id);expect(reads).toContain("normalize");builds.push(id);return {unit:id,head,stateHash:"native-state",buildKeys:["native-reader-build"],diagnosticCodes:[],result:"ok",cached:false,sha256:"b".repeat(64)};}},
  assemblyDraft:{stage:async(plan:unknown)=>{staged.push(plan);return {path:"/.tmp/native-draft",bytes:27,sha256:"c".repeat(64)};}},
 },[
  'const inventory=await workspace.readAssemblyInventory();const scope=await chooseAssemblyCandidate(goal,inventory);const sources=await workspace.readAssemblyUnits(scope.inspect,inventory.head);for(const _ of inventory.units){const next=await completeAssemblyScope(goal,inventory,scope,sources);if(!next.length)break;sources.push(...await workspace.readAssemblyUnits(next,inventory.head));}const dependencies=await interpretDependencies(goal,scope,sources);const builds=[];for(const id of await chooseAssemblyVerification(goal,inventory,scope,dependencies)){const receipt=await workspace.verifyAssemblyBuild(id,inventory.head);if(receipt)builds.push(receipt);}const plan=await decideAssemblyOutcome(goal,inventory,scope,dependencies,builds);const handoff=await shouldStageAssemblyDraft(goal,inventory.mayStage,plan)?await workspace.stageAssemblyDraft(plan):null;return {plan,handoff};',
  'return {root:"reader",inspect:["reader"]};',
  'return ["formatter"];','return ["normalize"];','return [];',
  'return {included:sources.map(source=>source.unit.id),amendment:[],blockers:[]};',
  'return inventory.allowedBuilds;',
  'return {root:scope.root,dependencies,head:inventory.head,disposition:"ready",builds,rationale:"Actual complete source closure and successful native build"};','return true;',
 ],"Prepare the requested reader draft with its actual transitive requirements. Verify the reader before retaining the draft.");
 expect(reads).toEqual(["reader","formatter","normalize"]);expect(builds).toEqual(["reader"]);expect(staged).toHaveLength(1);expect(result).toMatchObject({plan:{dependencies:{included:reads},builds:[{result:"ok"}]},handoff:{path:"/.tmp/native-draft"}});
},180000);
it("lets presentation reconsider a real revision change and retain only the current native preview receipt",async()=>{
 const card={id:"owned-briefing",title:"Shift tally",desk:"Briefing",period:"Current",status:"current"};
 const records=[1,2].map(value=>({...card,revision:"r"+value,previewAllowed:true,sections:[{id:"count",required:true,ask:"Display the exact current count",data:String(value)}]}));let current=0;const previews:string[]=[];
 const services={presentationRecords:{discover:async()=>[card],read:async(id:string)=>{expect(id).toBe(card.id);return records[current];},preview:async(id:string,revision:string,report:any)=>{expect(id).toBe(card.id);expect(revision).toBe(records[current]!.revision);expect(report.views[0].rendered.props.items[0].value).toBe(current+1);previews.push(revision);if(current===0){current=1;return {status:"changed",revision:"r2"};}return {status:"visible",receipt:{source:card.id,revision:"r2",viewIds:["actual-view"],mdxDigests:["actual-view-digest"]}};}}};
 const prepare='return {views:[{id:request.sections[0].id,status:"ready",rendered:{component:"Stats",props:{items:[{label:"Current count",value:Number(request.sections[0].data)}]},mdx:"<Stats />"}}],omitted:[]};';
 const result=await invoke(base,"skills/open-user-goal/reviewLocalPresentation.nl",services,[
  {code:'const selection=await selectSource(goal);if(selection.status!=="selected")throw Error("Expected actual permitted source");let currentRecord=selection.record;let lastPreview=await previewRecord(currentRecord.id,currentRecord.revision,await visualize.preparePresentation({goal,sections:currentRecord.sections}));',finish:false},
  'const cards=await listRecords();return {status:"selected",record:await readRecord(cards[0].id)};',prepare,
  'if(lastPreview.status!=="changed")throw Error("Expected actual coauthor change");const refreshed=await selectSource.readRecord(currentRecord.id);if(!await allowCurrentRecord(goal,currentRecord,refreshed))return {status:"held",reason:"Current source outside request",revision:refreshed.revision};currentRecord=refreshed;const finalPreview=await previewRecord(currentRecord.id,currentRecord.revision,await visualize.preparePresentation({goal,sections:currentRecord.sections}));if(finalPreview.status!=="visible")throw Error("No actual current visible readback");return {status:"visible",receipt:finalPreview.receipt,notes:[]};',
  'return true;',prepare,
 ],"Preview the current shift tally and include corrections made while working. No separate prose report is needed.");
 expect(previews).toEqual(["r1","r2"]);expect(result).toMatchObject({status:"visible",receipt:{revision:"r2",viewIds:["actual-view"]},notes:[]});
},180000);
it("loads the actual Personal NL entry and preserves exact event/hash citations through its named history hierarchy",async()=>{
 const root=process.env.VIBESTUDIO_HISTORY_COMPOSITION_ROOT;if(!root)throw Error("Explicit selected Personal source is required");
 const milestone={label:"Approved endpoint",eventId:"actual-history-event"};const source={eventId:milestone.eventId,path:"decision.txt",contentHash:"d".repeat(64),text:"Owner: Harbor desk"};const observed:string[]=[];
 const result=await invoke(root,"skills/open-personal-history/reviewPersonalHistory.nl",{archiveTimeline:{discover:async()=>({milestones:[milestone],leads:[]}),list:async(event:string)=>{expect(event).toBe(milestone.eventId);return [source.path];},read:async(event:string,path:string)=>{expect([event,path]).toEqual([milestone.eventId,source.path]);observed.push(event+":"+path);return source;}}},[
  'const selection=await chooseMilestones(goal,await archiveTimeline.discover());const findings=[];for(const milestone of selection.milestones)findings.push(await inspectMilestone(milestone,selection.field,goal));return reconcile(goal,findings);',
  'return {milestones:scope.milestones,field:"owner"};',
  'const paths=await archiveTimeline.list(milestone.eventId);const files=[];for(const path of paths)files.push(await archiveTimeline.read(milestone.eventId,path));return assessRecords(milestone,field,goal,files);',
  'return {label:milestone.label,status:"verified",citations:[{eventId:files[0].eventId,path:files[0].path,contentHash:files[0].contentHash,line:1,quote:files[0].text}]};',
  'return {findings,relation:"single",action:"clear"};',
 ],"Tell me the owner at the approved endpoint from its committed decision.");
 expect(observed).toEqual([milestone.eventId+":"+source.path]);expect(result).toMatchObject({findings:[{citations:[{contentHash:source.contentHash,quote:source.text}]}],relation:"single"});
},180000);
