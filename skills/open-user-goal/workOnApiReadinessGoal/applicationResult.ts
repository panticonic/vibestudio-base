import type {ApiReadinessResult,IntegrationReadinessPlan,ReadinessReport,QuietAudit,ReadinessArtifact} from "./types.js";
export default function applicationResult(plan:IntegrationReadinessPlan,review:ReadinessReport["review"],audit:QuietAudit|null,handoff:ReadinessArtifact|null):ApiReadinessResult {return {plan,review:review?.result??null,facts:audit?.facts??[],handoff};}
