import type {ImageAssessment,ImageRead,ImageDecision,ImageHandoff,ImageCandidateResult} from "./types.js";
export default function result(assessment:ImageAssessment,originals:ImageRead[],decision:ImageDecision,handoff:ImageHandoff|null):ImageCandidateResult {
 return {candidates:assessment.candidates,originals,decision,handoff};
}
