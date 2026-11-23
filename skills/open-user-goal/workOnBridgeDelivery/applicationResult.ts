import type {BranchAssessment,BranchPrivateNote,BridgeDecision,BridgeResult,LocalDeliveryReceipt} from "./types.js";
export default function applicationResult(branch:BranchAssessment,decision:BridgeDecision,commit:LocalDeliveryReceipt|null,handoff:BranchPrivateNote|null):BridgeResult {return {branch,decision,commit,handoff};}
