import {bindDisposition} from "./bindDisposition.js";
import type {ProjectEvidenceReview,ProjectDispositionChoice,ProjectEvidenceDecision} from "../types.js";
/** Bind only selected handles belonging to this exact source observation. */
export default function bindChosenDisposition(evidence:ProjectEvidenceReview,choice:ProjectDispositionChoice):ProjectEvidenceDecision {
  return bindDisposition(evidence,choice);
}
