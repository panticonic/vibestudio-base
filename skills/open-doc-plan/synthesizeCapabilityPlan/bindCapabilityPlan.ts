import type {
  CapabilityEvidence,
  CapabilityPlan,
  CapabilityPlanIntent,
  InstalledKnowledge,
  PlanningState,
} from "../types.js";

/** Join semantic choices to the exact observed interface and installed-document witnesses. */
export default function bindCapabilityPlan(
  intent: CapabilityPlanIntent,
  state: PlanningState,
  evidence: CapabilityEvidence,
  knowledge: InstalledKnowledge[],
): CapabilityPlan {
  if (intent.includeOverview && !evidence.overview)
    throw new Error(
      "A requested inventory needs its actual catalog observation.",
    );
  if (!intent.rationale.trim())
    throw new Error("A capability plan needs its actual explanation.");
  const entries = new Map(evidence.entries.map((entry) => [entry.id, entry]));
  const documents = new Map(
    knowledge.map((document) => [document.skillPath, document]),
  );
  return {
    status: intent.status,
    sourceRevision: state.sourceRevision,
    steps: intent.steps.map((step) => {
      const entry = entries.get(step.id);
      if (!entry || !step.purpose.trim())
        throw new Error(
          "Select an actually observed capability and explain its purpose.",
        );
      return {
        id: entry.id,
        sha256: entry.sha256,
        argumentNames: [...entry.argumentNames],
        signature: entry.signature,
        purpose: step.purpose,
      };
    }),
    rationale: intent.rationale,
    knowledge: [...new Set(intent.knowledgePaths)].map((path) => {
      const document = documents.get(path);
      const excerpt = document?.excerpts.find((item) => item.text.trim());
      if (!document || !excerpt)
        throw new Error("Select an actually loaded installed document.");
      return {
        skillPath: document.skillPath,
        sha256: document.sha256,
        revision: document.revision,
        quote: excerpt.text.slice(0, 360),
      };
    }),
    missing: intent.missing.map((item) => ({ ...item })),
    memoDisposition: intent.memoDisposition,
    overview: intent.includeOverview ? evidence.overview : null,
  };
}
