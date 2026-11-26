import type {AgentRecoveryFindings,Continuation,RetainedNotebookValue} from "./types.js";
export default function applicationResult(explanation:string,continuation:Continuation|null,retainedValues?:RetainedNotebookValue[]):AgentRecoveryFindings{
 return {...{explanation,continuation},...(retainedValues===undefined?{}:{retainedValues})};
}
