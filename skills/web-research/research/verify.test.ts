import { describe, expect, it } from "vitest";
import {
  checkedEvidence,
  checkedStatements,
  statedDate,
  windows,
  WINDOW,
} from "./researchBrief/verify.js";

const page =
  "Deno runs code in a sandbox.\n\nBy default, a program has no access to the file system, network or environment.";

describe("checkedEvidence", () => {
  it("keeps a claim whose quote is in the page, whitespace aside, once", () => {
    const quote =
      "By default, a program has no access to the file system, network or environment.";
    const kept = checkedEvidence(
      [
        { claim: "Programs start without access.", quote },
        { claim: "Same again.", quote },
        {
          claim: "Invented.",
          quote: "Every program can read the whole disk by default.",
        },
        { claim: "Too short.", quote: "Deno runs" },
      ],
      page,
    );
    expect(kept.map((item) => item.claim)).toEqual([
      "Programs start without access.",
    ]);
  });
});

describe("checkedStatements", () => {
  const claims = new Map([
    [1, "Programs start without access to the file system."],
  ]);
  it("drops statements that cite nothing, cite an unknown id, or share no content with their claims", () => {
    const kept = checkedStatements(
      [
        { text: "Programs begin without file system access.", cites: [1] },
        { text: "Programs begin without file system access.", cites: [] },
        { text: "Programs begin without file system access.", cites: [2] },
        { text: "Coffee improves compilation.", cites: [1] },
      ],
      claims,
    );
    expect(kept.map((statement) => statement.cites)).toEqual([[1]]);
  });
});

describe("windows", () => {
  it("splits a page into consecutive windows that rejoin to the page", () => {
    const text = "x".repeat(WINDOW * 2 + 10);
    const parts = windows(text);
    expect(parts.map((part) => part.length)).toEqual([WINDOW, WINDOW, 10]);
    expect(parts.join("")).toBe(text);
    expect(windows("")).toEqual([]);
  });
});

describe("statedDate", () => {
  it("reads the date a page states for itself", () => {
    expect(statedDate("Published: 2026-03-04\nBody")).toBe("2026-03-04");
    expect(statedDate("Last updated 4 March 2026 by the team")).toBe(
      "2026-03-04",
    );
    expect(statedDate("Published March 4, 2026")).toBe("2026-03-04");
    expect(
      statedDate("No date here, only 2026-03-04 in a table cell"),
    ).toBeNull();
  });
});
