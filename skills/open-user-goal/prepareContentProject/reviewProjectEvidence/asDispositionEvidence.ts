import {dispositionEvidence} from "./bindDisposition.js";
import type {ProjectEvidenceReview,ProjectDispositionEvidence} from "../types.js";
/** Expose semantic fact handles without changing the actual source observation. */
export default function asDispositionEvidence(evidence:ProjectEvidenceReview):ProjectDispositionEvidence {
  return dispositionEvidence(evidence);
}
