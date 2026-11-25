import {terminalRepairApply} from "natlang:services";
import inspectTerminalApp from "./workOnTerminalApp/inspectTerminalApp.nl";
import reviewTerminalCandidate from "./workOnTerminalApp/reviewTerminalCandidate.nl";
import verifyTerminalOutput from "./workOnTerminalApp/verifyTerminalOutput.nl";
import type {TerminalRepairReport} from "./types.js";

/** Compose native operations and scoped semantic judgments for the requested goal. */
export default async function workOnTerminalApp(goal:string):Promise<TerminalRepairReport>{
 const {app,check}=await inspectTerminalApp(goal);
 const plan=await reviewTerminalCandidate(goal,app,check);
 if(plan.status==="diagnosed"||plan.status==="hold-edit"||plan.status==="hold-test"||plan.status==="blocked")return {artifact:null,outcome:plan.status,explanation:plan.reason};
 let revision=check.observed.revision;
 if(plan.status==="repair"){
  const applied=await terminalRepairApply.edit(app.id,revision,plan.edits);
  if(applied.status==="moved")return {artifact:null,outcome:"hold-moved",explanation:`The reviewed revision changed to ${applied.revision}.`};
  revision=applied.revision;
 }
 const verified=await verifyTerminalOutput(app.id,revision);
 return verified.artifact?{artifact:verified.artifact,outcome:plan.status==="existing"?"already-ready":"verified",explanation:plan.reason}:{artifact:null,outcome:"blocked",explanation:"The exact candidate lacks a verified native terminal artifact."};
}
