import {iterateOn} from "@natlang/node";
import {goalBrowser} from "natlang:services";
import choosePanelAction from "./workInBrowser/choosePanelAction.nl";
import type {BrowserGoalReport,BrowserView} from "./types.js";

type BrowserProgress={view:BrowserView;changed:boolean;attempted:string[];result:BrowserGoalReport|null};
/** Reconsider actual visible state after each action, within the explicit policy-call budget. */
export default async function workInBrowser(goal:string):Promise<BrowserGoalReport>{
 const initial:BrowserProgress={view:await goalBrowser.inspect(),changed:false,attempted:[],result:null};
 const advanceBrowserGoal=async(state:BrowserProgress):Promise<BrowserProgress>=>{
  const {view,changed,attempted}=state,decision=await choosePanelAction(goal,view);
  if(decision.kind==="blocked")return {...state,result:{status:"blocked",reason:decision.reason}};
  if(decision.kind==="report")return {...state,result:{status:changed?"changed":"observed",revision:view.revision,rows:view.rows.filter(row=>decision.labels.includes(row.label)).map(({label,state,detail})=>({label,state,detail}))}};
  if(!view.rows.some(row=>row.controls.some(control=>control.id===decision.control)))return {...state,result:{status:"blocked",reason:"The selected control is absent from the current visible panel."}};
  const key=JSON.stringify([view.revision,decision.control]);
  if(attempted.includes(key))return {...state,result:{status:"blocked",reason:"The selected visible action made no confirmed progress."}};
  const effect=await goalBrowser.activate(decision.control,view.revision),current=await goalBrowser.inspect();
  return {view:current,changed:changed||effect==="activated",attempted:[...attempted,key],result:effect==="unavailable"?{status:"blocked",reason:"The selected visible control is unavailable."}:null};
 };
 const settled=await iterateOn(advanceBrowserGoal,initial).withLimit({maxSteps:40}).until(state=>state.result!==null);
 if(!settled.result)throw new Error("Browser iteration ended without its requested result");
 return settled.result;
}
