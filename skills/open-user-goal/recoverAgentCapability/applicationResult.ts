import type {AgentRecoveryFindings,Continuation} from "./types.js";
export default function applicationResult(explanation:string,continuation:Continuation|null):AgentRecoveryFindings{return {explanation,continuation};}
