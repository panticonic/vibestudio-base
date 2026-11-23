import listLaunchSlots from "./reconcilePanelLaunchState/workspace/listLaunchSlots.js";
import readLaunchSlot from "./reconcilePanelLaunchState/workspace/readLaunchSlot.js";
import bindLaunchAuthority from "./reconcilePanelLaunchState/workspace/bindLaunchAuthority.js";
import applyLaunchPatch from "./reconcilePanelLaunchState/workspace/applyLaunchPatch.js";
import readbackLaunchSlot from "./reconcilePanelLaunchState/workspace/readbackLaunchSlot.js";
import writeLaunchNote from "./reconcilePanelLaunchState/workspace/writeLaunchNote.js";
import planLaunchState from "./reconcilePanelLaunchState/planLaunchState.nl";
import decideLaunchChange from "./reconcilePanelLaunchState/decideLaunchChange.nl";
import reviewLaunchAuthority from "./reconcilePanelLaunchState/reviewLaunchAuthority.js";
import concludeLaunchState from "./reconcilePanelLaunchState/concludeLaunchState.nl";
import applicationResult from "./reconcilePanelLaunchState/applicationResult.js";
import type {LaunchResult,LaunchPreflight,LaunchEffect,LaunchReport} from "./reconcilePanelLaunchState/types.js";

/** Reconcile one owned slot; semantic judgments stay in scoped natural-language functions. */
export default async function reconcilePanelLaunchState(goal:string):Promise<LaunchResult|null>{
 const plan=await planLaunchState(goal,await listLaunchSlots());
 const opening=await readLaunchSlot(plan.panelId),current=await readLaunchSlot(plan.panelId);
 if(!opening||!current)return null;
 const decision=await decideLaunchChange(goal,plan,opening,current);
 let preflight:LaunchPreflight|null=null,effect:LaunchEffect|null=null;
 if(decision.attempt){
  const request=await bindLaunchAuthority(plan.panelId,current.digest,plan.patch);
  if(request){
   const report=await reviewLaunchAuthority(request);preflight={request,report};
   if(report.status==="eligible")effect=await applyLaunchPatch(plan.panelId,current.digest,plan.patch);
  }
 }
 const readback=await readbackLaunchSlot(plan.panelId);if(!readback)return null;
 const result=await concludeLaunchState(plan,opening,current,decision,effect,readback);
 const record:LaunchReport={plan,opening,current,decision,preflight,effect,readback,result,handoff:null};
 const handoff=plan.retain?await writeLaunchNote(record):null;
 return applicationResult(readback,result,handoff);
}
