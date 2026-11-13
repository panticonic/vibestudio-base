import { beforeEach, describe, expect, it, vi } from "vitest";

const runtimeMock = vi.hoisted(() => ({
  gad: { diagnoseInvocation: vi.fn() },
  problemReports: { availability: vi.fn() },
}));
vi.mock("@workspace/runtime", () => runtimeMock);

import { assembleDraft as assemble } from "./draft-assemble.js";
import { draftProblemReport } from "./draft-problem-report.js";
import type { Evidence } from "./types.js";

const evidence = (overrides: Partial<Evidence> = {}): Evidence => ({
  goal: "Sort alpha, gamma, beta.",
  observed: "It answered gamma, beta, alpha.",
  expected: "alpha, beta, gamma",
  operation: null,
  attempts: "",
  reproduced: false,
  ...overrides,
});

describe("assemble", () => {
  const facts = {
    destination: "https://vibestudio.app/v1/problem-reporting",
    diagnostic: "",
    gaps: ["invocation diagnostic unavailable: denied"],
  };

  it("lays the account out as sections, marking it unverified until it was reproduced", () => {
    const draft = assemble(evidence({ attempts: "Asked again." }), facts);
    expect(draft.narrative.map((section) => [section.section, section.claims])).toEqual([
      ["goal", "unverified"],
      ["symptom", "unverified"],
      ["expected", "unverified"],
      ["attempts", "unverified"],
    ]);
    expect(draft.problem).toEqual({
      operation: null,
      symptom: "It answered gamma, beta, alpha.",
      expected: "alpha, beta, gamma",
    });
    const reproduced = assemble(evidence({ reproduced: true }), facts);
    expect(reproduced.narrative.find((section) => section.section === "symptom")?.claims).toBe(
      "observed"
    );
  });

  it("adds the platform's diagnostic as an observed finding", () => {
    const draft = assemble(evidence(), { ...facts, diagnostic: "invocation inv_1: status failed" });
    expect(draft.narrative.at(-1)).toEqual({
      section: "findings",
      claims: "observed",
      markdown: "invocation inv_1: status failed",
    });
  });

  it("copies a valid operation token, nulls an invalid one, and records the gaps", () => {
    expect(
      assemble(evidence({ operation: "eval.returnImage" }), facts).problem.operation
    ).toBe("eval.returnImage");
    const draft = assemble(evidence({ operation: "eval return image" }), facts);
    expect(draft.problem.operation).toBeNull();
    expect(draft.gaps).toEqual([
      "invocation diagnostic unavailable: denied",
      "not reproduced: the report records the account as given",
      "operation unknown",
    ]);
  });

  it("refuses to silently shorten a narrative over the limit", () => {
    expect(() => assemble(evidence({ observed: "x".repeat(129 * 1024) }), facts)).toThrow(
      /never silently shortened/
    );
  });
});

describe("draftProblemReport", () => {
  const invocation = { trajectoryId: "traj_1", branchId: "main", invocationId: "inv_1" };

  beforeEach(() => {
    vi.clearAllMocks();
    runtimeMock.problemReports.availability.mockResolvedValue({
      destination: "https://vibestudio.app/v1/problem-reports",
    });
  });

  it("lays the evidence out as given and leaves redaction to prepare", async () => {
    const draft = await draftProblemReport(evidence({ observed: "Failed in /home/werg/x" }));
    expect(draft.problem.symptom).toBe("Failed in /home/werg/x");
    expect(draft.destination).toBe("https://vibestudio.app/v1/problem-reports");
    expect(draft.gaps).toEqual([
      "not reproduced: the report records the account as given",
      "operation unknown",
    ]);
    expect(runtimeMock.gad.diagnoseInvocation).not.toHaveBeenCalled();
  });

  it("adds one bounded diagnostic as an observed finding when evidence names an invocation", async () => {
    runtimeMock.gad.diagnoseInvocation.mockResolvedValue({
      invocation: {
        invocation_id: "inv_1",
        status: "failed",
        terminal_outcome: "error",
        terminal_reason_code: null,
      },
      events: [{}, {}],
      commands: [{}],
    });
    const draft = await draftProblemReport(evidence({ invocation }));
    expect(runtimeMock.gad.diagnoseInvocation).toHaveBeenCalledWith({
      ...invocation,
      eventLimit: 20,
      commandLimit: 20,
      effectLimit: 50,
    });
    expect(draft.narrative.at(-1)).toEqual({
      section: "findings",
      claims: "observed",
      markdown:
        "invocation inv_1: status failed; terminal outcome error; reason code none; 2 events, 1 commands read",
    });
  });

  it("records a denied diagnostic as a gap instead of failing", async () => {
    runtimeMock.gad.diagnoseInvocation.mockRejectedValue(new Error("denied for a non-owner"));
    const draft = await draftProblemReport(evidence({ invocation }));
    expect(draft.gaps).toContain("invocation diagnostic unavailable: denied for a non-owner");
    expect(draft.narrative.map((section) => section.section)).not.toContain("findings");
  });
});
