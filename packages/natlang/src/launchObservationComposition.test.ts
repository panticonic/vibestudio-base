/** TEST ONLY: scripted local gateway, real ProgramLoader and source; no provider or teacher registry. */
import {it,expect} from "vitest";
import {readFile,readdir,stat} from "node:fs/promises";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {createEvalNatlang} from "@workspace/natlang";
import {fakeRpc,testNewFunction,toolCallMessage} from "./testSupport.js";

const base=fileURLToPath(new URL("../../../",import.meta.url));
async function installedFs(){
 const roots=[base];
 const selector=process.env.VIBESTUDIO_TEMPLATE_CHECKOUTS;
 if(selector)for(const name of await readdir(selector))if(name!=="base")roots.push(resolve(selector,name));
 const owners=new Map<string,string>();
 for(const root of roots){let entries;try{entries=await readdir(root+"/skills",{withFileTypes:true});}catch{continue;}
  for(const entry of entries)if(entry.isDirectory()&&!owners.has(entry.name))owners.set(entry.name,root);}
 const source=(path:string)=>resolve(path.startsWith("skills/")?(owners.get(path.split("/")[1])??base):base,path);
 return {readFile:(p:string)=>readFile(source(p),"utf8"),readdir:(p:string)=>readdir(source(p),{withFileTypes:true}),stat:async(p:string)=>{const s=await stat(source(p));return{isDirectory:()=>s.isDirectory()};}};
}
const rootCode=`const index=await workspace.listLaunchSlots();const plan=await planLaunchState(goal,index);
const before=await observeLaunchScope(goal,index,plan,workspace.readLaunchSlot);if(!before)return null;
const decision=await decideLaunchChange(goal,plan,before.opening,before.current);
const application=await applyAuthorizedLaunchChange(plan,before.current,decision);
const after=await verifyLaunchScope(goal,index,plan,before,decision,application.effect,workspace.readLaunchSlot,workspace.readbackLaunchSlot);if(!after)return null;
const result=await concludeLaunchState(goal,index,before.companions,after.companions,plan,before.opening,before.current,decision,application.effect,after.readback);
const report={plan,opening:before.opening,current:before.current,decision,preflight:application.preflight,effect:application.effect,readback:after.readback,result,handoff:null};
const handoff=plan.retain?await workspace.writeLaunchNote(report):null;return applicationResult(after.readback,result,handoff);`;
const authorityCodes=[
 `const reviews=[];for(const operation of request.operations)reviews.push(await reviewOperation(operation.id,request.ceiling));const combined=await combineCeiling(reviews);return {...combined,reviews};`,
 `const observation=await preflight(operationId);const outside=await findOutside(observation.leaves,ceiling);const disposition=await decideDisposition(observation.decision,outside);return {observation,outside,disposition};`,
 `return leaves.filter(x=>x.tier!=="open"&&!ceiling.some(c=>c.capability===x.capability&&c.resourceKey===x.resourceKey)).map(x=>({capability:x.capability,resourceKey:x.resourceKey}));`,
 `return outside.length?"outside-ceiling":decision==="allowed"?"eligible":decision==="denied"?"host-denied":"needs-acquisition";`,
 `const protectedLeaves=await collectProtected(reviews);const held=reviews.filter(x=>["outside-ceiling","host-denied"].includes(x.disposition)).map(x=>x.observation.operationId);return {status:held.length?"held":reviews.some(x=>x.disposition==="needs-acquisition")?"needs-acquisition":"eligible",held,protectedLeaves};`,
 `const result=[];for(const review of reviews)for(const leaf of review.observation.leaves)if(leaf.tier!=="open"&&!result.some(x=>x.capability===leaf.capability&&x.resourceKey===leaf.resourceKey))result.push({capability:leaf.capability,resourceKey:leaf.resourceKey});return result;`,
];
for(const variant of ["companion-first","redundant-grouped","effect-only","read-only","private-note","stale","authority-denied","foreign-required"]){
 it(`launch observation composition ${variant} executes actual scoped read callbacks and truthful native outcome`,async()=>{
  const companion=variant==="companion-first"||variant==="redundant-grouped";
  const goal=variant==="private-note"?"Reverse only the active launch order and retain a private note of the saved result.":variant==="read-only"?"Inspect the currently persisted active launch state without changing it.":companion?"Reverse the active launch order and check that the similarly named record remains untouched.":variant==="foreign-required"?"Check the foreign record before making any change.":"Reverse only the active launch order if the current state and authority still permit it.";
  const state=(owner:string)=>({title:"Same title",owner,mode:"ready",count:2,settings:{side:"left",order:"forward",pins:["keep"]}});
  const make=(panelId:string,owner:string)=>({panelId,entryKey:panelId+"-entry",entityId:panelId+"-entity",contextId:"owned-context",buildKey:"build",digest:panelId+"-v1",state:state(owner)});
  let active=make("active","owner"),archive=make("archive","archive-owner");const originalArchive=structuredClone(archive);
  const events:string[]=[],records:any[]=[],contexts:any[]=[];let writes=0,witness=false;let stagedReport:any=null;const note={path:"/.tmp/test-only-launch/handoff.json",digest:"test-only-native-note-digest"};
  const patch={settings:{order:"reverse"}},request={goal,operations:[{id:"operation",label:"Exact launch patch"}],ceiling:[{capability:"state",resourceKey:"active"}]};
  const services={launchStateRead:{enumerate:async()=>[{panelId:"archive",title:"Same title",purpose:"archive"},{panelId:"active",title:"Same title",purpose:"active"}],
   read:async(id:string)=>{events.push("read:"+id);return structuredClone(id==="active"?active:id==="archive"?archive:null);},
   seal:async(id:string)=>{events.push("seal:"+id);return id==="active"?structuredClone(active):null;},
   bind:async(id:string,basis:string,given:unknown)=>{events.push("bind:"+id);if(variant==="stale")active={...active,digest:"owner-advanced",state:{...active.state,count:3}};return id==="active"&&basis===active.digest&&JSON.stringify(given)===JSON.stringify(patch)?structuredClone(request):null;}},
   assignedAuthorityRead:{preflight:async(id:string)=>{events.push("authority:"+id);witness=variant!=="authority-denied";return {operationId:id,decision:witness?"allowed":"denied",leaves:[{capability:"state",resourceKey:"active",tier:"gated",status:witness?"granted":"denied"}]};}},
   launchStateWrite:{patch:async(id:string,basis:string,given:any)=>{events.push("patch:"+id);if(!witness||id!=="active"||basis!==active.digest)return null;writes++;active={...active,digest:"saved-v2",state:{...active.state,settings:{...active.state.settings,...given.settings}}};return{panelId:id,basis,kind:"saved",state:structuredClone(active.state),message:null};},stage:async(report:any)=>{if(variant!=="private-note")throw Error("Unrequested note");if(report.readback.digest!==active.digest||report.handoff!==null)return null;stagedReport=structuredClone(report);return note;}}};
  const before=variant==="foreign-required"?`const unavailable=await readSlot("foreign");if(unavailable!==null)throw Error("foreign capability leaked");return null;`:companion?variant==="companion-first"?
   `const other=await readSlot(index.find(x=>x.purpose==="archive").panelId);const opening=await readSlot(plan.panelId);const current=await readSlot(plan.panelId);return {opening,current,companions:[other]};`:
   `const opening=await readSlot(plan.panelId);const other=await readSlot("archive");await readSlot("archive");const current=await readSlot(plan.panelId);return {opening,current,companions:[other]};`:
   `const opening=await readSlot(plan.panelId);const current=await readSlot(plan.panelId);return {opening,current,companions:[]};`;
  const after=variant==="redundant-grouped"?`const other=await readSlot("archive");const readback=await sealSlot(plan.panelId);await readSlot("archive");return {readback,companions:[other]};`:
   `const readback=await sealSlot(plan.panelId);return {readback,companions:${companion?'[await readSlot("archive")]':'[]'}};`;
  const held=variant==="stale"||variant==="authority-denied";const readonly=variant==="read-only";
  const conclusion=companion?`if(!companionsBefore.length||!companionsAfter.length||JSON.stringify(companionsBefore[0])!==JSON.stringify(companionsAfter[0]))return {status:"held",summary:"Companion protection lacks matching observed evidence."};return {status:"applied",summary:"Saved active reverse order; the independently observed similarly named record is unchanged."};`:
   `return {status:${JSON.stringify(readonly?"confirmed":held?"held":"applied")},summary:${JSON.stringify(readonly?"The active persisted launch state is observed without a mutation.":held?"Current native basis or authority withheld this change.":"Saved active reverse order.")}};`;
  const codes=[rootCode,`return {panelId:index.find(x=>x.purpose==="active").panelId,direction:${readonly?'"read"':'"write"'},patch:${readonly?'{}':'{settings:{order:"reverse"}}'},retain:${variant==="private-note"}};`,'if(typeof workspace!=="undefined"||typeof launchStateWrite!=="undefined"||typeof assignedAuthorityRead!=="undefined")throw Error("Observation acquired ambient authority");\n'+before,
   ...(variant==="foreign-required"?[]:[`return {attempt:${!readonly},reason:"Requested minimal native change on the observed basis."};`,...(variant==="stale"||readonly?[]:authorityCodes),after,conclusion])];
  let step=0;
  const {rpc}=fakeRpc({records:{record:({record}:any)=>{records.push(record);return{recordId:record.call_id};}},turn:async input=>{contexts.push(input.context);if(step>=codes.length)throw Error("TEST-only script exhausted; no fallback provider");return toolCallMessage("eval",{code:codes[step++],finish:true});}});
  const runtime=createEvalNatlang({newFunction:testNewFunction(),owner:{kind:"user",objectKey:"test-only-launch-observation"},bindings:{rpc,fs:await installedFs()}});
  try{
   const actual=await runtime.runCell(async()=>{const entry=await (runtime.ambient.natlang as any).load("skills/open-user-goal/reconcilePanelLaunchState.nl",{services});return await entry(goal);},{runId:"test-only-launch-"+variant,signal:new AbortController().signal});
   expect(step).toBe(codes.length);expect(archive).toEqual(originalArchive);
   if(variant==="foreign-required"){expect(actual.value).toBeNull();expect(writes).toBe(0);expect(events).toEqual(["read:foreign"]);}
   else{expect((actual.value as any).result.status).toBe(readonly?"confirmed":held?"held":"applied");expect(writes).toBe(held||readonly?0:1);expect((actual.value as any).readback).toEqual(active);expect(events.some(e=>e==="seal:archive"||e==="patch:archive")).toBe(false);}
   expect(events.filter(e=>e==="read:archive").length).toBe(companion?(variant==="redundant-grouped"?4:2):0);
   expect(contexts.length).toBeGreaterThanOrEqual(3);
   // Actual scoped callback arguments reach the nested NL observation, rather than a generic root-only prompt.
   expect(JSON.stringify(contexts[2])).toContain("readSlot");expect(JSON.stringify(contexts[2])).toContain(goal);
   const root=records.find(r=>r.definition?.name==="reconcilePanelLaunchState");
   const observer=records.find(r=>r.definition?.name==="observeLaunchScope");
   expect(root).toBeTruthy();expect(observer?.parent_call_id).toBe(root.call_id);
   const nativeReads=records.filter(r=>r.definition?.name==="readLaunchSlot"&&r.parent_call_id===observer.call_id);
   expect(nativeReads.length).toBeGreaterThan(0);
   expect(observer.effects).toEqual([]); // physical service calls belong to the actual native callees
   if(variant==="private-note"){expect(stagedReport.readback).toEqual(active);expect((actual.value as any).handoff).toEqual(note);}
   else expect(stagedReport).toBeNull();
  }finally{runtime.close();}
 },60000);
}
