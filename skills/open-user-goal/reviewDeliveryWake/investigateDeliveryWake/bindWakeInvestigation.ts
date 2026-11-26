import type {DeliveryWakeEvidence,DeliveryMatch,DeliveryWakePlan,DeliveryWakeInvestigation} from "../types.js";
export default function bindWakeInvestigation(evidence:DeliveryWakeEvidence,match:DeliveryMatch,plan:DeliveryWakePlan):DeliveryWakeInvestigation{return{evidence,match,plan};}
