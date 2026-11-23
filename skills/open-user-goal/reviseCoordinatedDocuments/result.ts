import type {CoordinatedRevisionReport, CoordinatedRevisionResult} from "./types.js";
export default function result(report:CoordinatedRevisionReport):CoordinatedRevisionResult {
 const plan=report.reconciled ?? report.plan;
 return {status:plan.status,head:report.readback.head,documents:report.readback.files.map(({path,version})=>({path,version})),explanation:plan.explanation};
}
