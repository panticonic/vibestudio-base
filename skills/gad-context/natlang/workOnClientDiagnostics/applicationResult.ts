import type {ClientDiagnosticResult} from "../types.js";
export default function applicationResult(channel:ClientDiagnosticResult["channel"],decision:ClientDiagnosticResult["decision"],handoff:ClientDiagnosticResult["handoff"]):ClientDiagnosticResult {return {channel,decision,handoff};}
