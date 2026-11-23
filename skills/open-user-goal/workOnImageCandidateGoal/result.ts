import type {ImageReport,ImageCandidateResult} from "./types.js";
export default function result(report:ImageReport):ImageCandidateResult {
 return {candidates:report.assessment.candidates,originals:report.reads,decision:report.decision,handoff:report.handoff};
}
