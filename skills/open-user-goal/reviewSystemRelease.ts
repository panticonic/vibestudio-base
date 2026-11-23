import discoverRelease from "./reviewSystemRelease/discoverRelease.js";
import stageRelease from "./reviewSystemRelease/stageRelease.js";
import compareRuns from "./reviewSystemRelease/compareRuns.nl";
import evaluateCases from "./reviewSystemRelease/evaluateCases.nl";
import type {SystemReleaseOutcome} from "./reviewSystemRelease/types.js";

/** Compose native operations and scoped semantic judgments for the requested goal. */
export default async function reviewSystemRelease(goal:string):Promise<SystemReleaseOutcome>{
 const assignment=await discoverRelease();
 const compared=await compareRuns(assignment);
 if(!compared.choice.runId){
  if(!compared.choice.blocker)throw new Error("Release without a selected run must identify its actual blocker");
  return {assessment:{disposition:compared.choice.blocker,reason:compared.choice.blocker,decisive:[]},handoff:null};
 }
 const {cases,assessment}=await evaluateCases(assignment,compared.choice);
 const handoff=assessment.disposition==="stage-acceptance"||assessment.disposition==="stage-diagnostics"?await stageRelease(assignment,compared.choice,cases,assessment):null;
 return {assessment,handoff};
}
