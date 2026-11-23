import type {RevisionPlan,RevisionReadback,RevisionReceipt,CoordinatedRevisionResult} from "./types.js";
export default function result(plan:RevisionPlan,readback:RevisionReadback,receipt:RevisionReceipt|null):CoordinatedRevisionResult {
 return {status:receipt?.status==="applied"?"updated":plan.status==="held"?"held":plan.status==="already-aligned"?"unchanged":"unavailable",head:readback.head,documents:readback.files.map(({path,version})=>({path,version})),explanation:plan.explanation};
}
