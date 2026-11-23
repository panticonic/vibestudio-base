import type {RevisionPlan,RevisionReadback,CoordinatedRevisionResult} from "./types.js";
export default function result(plan:RevisionPlan,readback:RevisionReadback):CoordinatedRevisionResult {
 return {status:plan.status,head:readback.head,documents:readback.files.map(({path,version})=>({path,version})),explanation:plan.explanation};
}
