import type {
  TemplateAuthoringPlan,
  TemplateAuthoringRequest,
  TemplatePublicationInput,
} from "../types.js";

export default function publicationReviewInput(
  request: TemplateAuthoringRequest,
  plan: TemplateAuthoringPlan,
): TemplatePublicationInput {
  const acknowledged = new Set(request.acknowledgedParts);
  return {
    kind: "publication",
    goal: request.goal,
    inspectedFingerprint: request.reviewedFingerprint ?? plan.fingerprint,
    currentFingerprint: plan.fingerprint,
    missingParts: plan.requiredParts.filter((part) => !acknowledged.has(part)),
    destination: request.destination,
    version: request.version,
    receipt: null,
  };
}
