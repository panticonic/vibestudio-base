import discoverWidth from "./reviewLocalExecutionWidth/discoverWidth.js";
import localModelReadiness from "./reviewLocalExecutionWidth/readiness/localModelReadiness.nl";
import assessExecution from "./reviewLocalExecutionWidth/assessExecution.nl";
import shouldRetainWidth from "./reviewLocalExecutionWidth/shouldRetainWidth.nl";
import stageWidth from "./reviewLocalExecutionWidth/stageWidth.js";
import type {LocalWidthOutcome} from "./reviewLocalExecutionWidth/types.js";

/** Compose native operations and scoped semantic judgments for the requested goal. */
export default async function reviewLocalExecutionWidth(goal:string):Promise<LocalWidthOutcome>{
 const survey=await discoverWidth();
 const readiness=await localModelReadiness();
 const finding=await assessExecution(goal,survey,readiness);
 const authorized=survey.release==="include-hold"||(survey.release==="verified"&&finding.disposition==="verified");
 const handoff=authorized&&await shouldRetainWidth(goal)?await stageWidth(finding):null;
 return {finding,handoff};
}
