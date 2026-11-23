import {goalBrowser} from "natlang:services";
import choosePanelAction from "./workInBrowser/choosePanelAction.nl";
import type {BrowserGoalReport} from "./types.js";

/** Compose native operations and scoped semantic judgments for the requested goal. */
export default async function workInBrowser(goal:string):Promise<BrowserGoalReport>{
 let view=await goalBrowser.inspect(),changed=false;
 const attempted=new Set<string>();
 for(;;){
  const decision=await choosePanelAction(goal,view);
  if(decision.kind==="blocked")return {status:"blocked",reason:decision.reason};
  if(decision.kind==="report")return {status:changed?"changed":"observed",revision:view.revision,rows:view.rows.filter(row=>decision.labels.includes(row.label)).map(({label,state,detail})=>({label,state,detail}))};
  if(!view.rows.some(row=>row.controls.some(control=>control.id===decision.control)))return {status:"blocked",reason:"The selected control is absent from the current visible panel."};
  const key=JSON.stringify([view.revision,decision.control]);
  if(attempted.has(key))return {status:"blocked",reason:"The selected visible action made no confirmed progress."};
  attempted.add(key);
  const effect=await goalBrowser.activate(decision.control,view.revision);
  view=await goalBrowser.inspect();
  if(effect==="unavailable")return {status:"blocked",reason:"The selected visible control is unavailable."};
  if(effect==="activated")changed=true;
 }
}
