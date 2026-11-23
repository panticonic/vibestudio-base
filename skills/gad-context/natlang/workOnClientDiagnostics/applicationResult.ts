import type {ClientDiagnosticResult,ChannelReview,ClientDecision,ClientHandoff} from "../types.js";
export default function applicationResult(channel:ChannelReview|null,decision:ClientDecision,handoff:ClientHandoff|null):ClientDiagnosticResult {return {channel,decision,handoff};}
