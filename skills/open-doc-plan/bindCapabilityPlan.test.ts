import { describe, expect, it } from "vitest";
import bindCapabilityPlan from "./synthesizeCapabilityPlan/bindCapabilityPlan.js";
import type {
  CapabilityEvidence,
  CapabilityPlanIntent,
  InstalledKnowledge,
  PlanningState,
} from "./types.js";
const state: PlanningState = {
  memo: null,
  skillIndex: [],
  skillIndexComplete: true,
  sourceRevision: { kind: "event", eventId: "current-owned-head" },
  stageAuthorized: false,
};
const evidence: CapabilityEvidence = {
  entries: [
    {
      id: "service:build.actual",
      surface: "service",
      qualifiedName: "build.actual",
      title: "actual",
      sha256: "native-description-hash",
      argumentNames: ["ref"],
      signature: "(ref: Ref) => Artifact",
      argsSchema: { type: "object" },
      returnsSchema: { type: "object" },
      omittedSchemas: [],
      access: {},
    },
  ],
  overview: null,
};
const knowledge: InstalledKnowledge = {
  skillPath: "skills/publishing/SKILL.md",
  sha256: "native-document-hash",
  revision: {
    state: state.sourceRevision,
    repositoryId: "native-repo",
    fileId: "native-file",
    contentHash: "native-content",
  },
  excerpts: [
    {
      heading: "Sources",
      text: "Use an immutable exact source reference before publishing.",
    },
  ],
};
const intent: CapabilityPlanIntent = {
  status: "ready",
  steps: [
    {
      id: "service:build.actual",
      purpose: "Prepare the requested immutable artifact.",
    },
  ],
  rationale: "Plan only; the current request does not authorize execution.",
  knowledgePaths: [knowledge.skillPath],
  missing: [],
  memoDisposition: "none",
  includeOverview: false,
};
describe("native capability witness binding", () => {
  it("joins semantic choices to actual source witnesses without model-copied metadata", () => {
    const plan = bindCapabilityPlan(intent, state, evidence, [knowledge]);
    expect(plan.steps[0]).toEqual({
      id: "service:build.actual",
      sha256: "native-description-hash",
      argumentNames: ["ref"],
      signature: "(ref: Ref) => Artifact",
      purpose: intent.steps[0]!.purpose,
    });
    expect(plan.sourceRevision).toEqual(state.sourceRevision);
    expect(plan.knowledge[0]).toEqual({
      skillPath: knowledge.skillPath,
      sha256: knowledge.sha256,
      revision: knowledge.revision,
      quote: knowledge.excerpts[0]!.text,
    });
    expect(plan.rationale).toBe(intent.rationale);
    expect(plan.status).toBe("ready");
    expect(evidence.entries[0]!.argumentNames).toEqual(["ref"]);
  });
  it("refuses an unobserved method or unloaded document", () => {
    expect(() =>
      bindCapabilityPlan(
        {
          ...intent,
          steps: [{ id: "service:foreign.operation", purpose: "unsupported" }],
        },
        state,
        evidence,
        [knowledge],
      ),
    ).toThrow("actually observed");
    expect(() => bindCapabilityPlan(intent, state, evidence, [])).toThrow(
      "actually loaded",
    );
  });
  it("refuses a claimed inventory without an actual overview and an empty explanation", () => {
    expect(() =>
      bindCapabilityPlan(
        { ...intent, includeOverview: true },
        state,
        evidence,
        [knowledge],
      ),
    ).toThrow("actual catalog observation");
    expect(() =>
      bindCapabilityPlan({ ...intent, rationale: " " }, state, evidence, [
        knowledge,
      ]),
    ).toThrow("actual explanation");
  });
  it("retains an honest hold without fabricating substitute steps", () => {
    const hold = bindCapabilityPlan(
      {
        ...intent,
        status: "hold",
        steps: [],
        knowledgePaths: [],
        missing: [{ kind: "method", name: "build.unavailable" }],
        rationale: "The current role does not expose the requested method.",
      },
      state,
      evidence,
      [],
    );
    expect(hold.status).toBe("hold");
    expect(hold.steps).toEqual([]);
    expect(hold.missing).toEqual([
      { kind: "method", name: "build.unavailable" },
    ]);
  });
});
