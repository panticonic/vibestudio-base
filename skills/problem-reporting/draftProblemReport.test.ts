import { describe, expect, it } from "vitest";
import assemble from "./draftProblemReport/assemble.js";
import redact from "./draftProblemReport/redact.js";
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

describe("redact", () => {
  it("removes tokens, URL queries and userinfo, and home paths, and names what it removed", () => {
    const result = redact(
      "GET https://bob:pw@api.example.com/v1/items?api_key=abc123def456ghi failed; Authorization: Bearer ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa in /home/werg/.config/x and C:\\Users\\Maria\\AppData; password=hunter2hunter2"
    );
    expect(result.text).not.toMatch(/ghp_|abc123|bob:pw|\/home\/werg|Maria|hunter2/);
    expect(result.text).toContain("https://api.example.com/v1/items");
    expect(result.removed).toEqual(
      expect.arrayContaining([
        "bearer token",
        "URL query or userinfo",
        "home path",
        "credential assignment",
      ])
    );
  });

  it("leaves ordinary text alone", () => {
    expect(redact("It answered gamma, beta, alpha.")).toEqual({
      text: "It answered gamma, beta, alpha.",
      removed: [],
    });
  });
});

describe("assemble", () => {
  const facts = {
    destination: "https://vibestudio.app/v1/problem-reporting",
    diagnostic: "",
    gaps: ["invocation diagnostic unavailable: denied"],
  };

  it("lays the account out as sections, marking it unverified until it was reproduced", () => {
    const draft = assemble(evidence({ attempts: "Asked again." }), facts, []);
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
    const reproduced = assemble(evidence({ reproduced: true }), facts, []);
    expect(reproduced.narrative.find((section) => section.section === "symptom")?.claims).toBe(
      "observed"
    );
  });

  it("adds the platform's diagnostic as an observed finding", () => {
    const draft = assemble(
      evidence(),
      { ...facts, diagnostic: "invocation inv_1: status failed" },
      []
    );
    expect(draft.narrative.at(-1)).toEqual({
      section: "findings",
      claims: "observed",
      markdown: "invocation inv_1: status failed",
    });
  });

  it("copies a valid operation token, nulls an invalid one, and records the gaps", () => {
    expect(
      assemble(evidence({ operation: "eval.returnImage" }), facts, ["home path"]).problem.operation
    ).toBe("eval.returnImage");
    const draft = assemble(evidence({ operation: "eval return image" }), facts, ["home path"]);
    expect(draft.problem.operation).toBeNull();
    expect(draft.gaps).toEqual([
      "invocation diagnostic unavailable: denied",
      "not reproduced: the report records the account as given",
      "operation unknown",
      "removed before drafting: home path",
    ]);
  });

  it("refuses to silently shorten a narrative over the limit", () => {
    expect(() => assemble(evidence({ observed: "x".repeat(129 * 1024) }), facts, [])).toThrow(
      /never silently shortened/
    );
  });
});
