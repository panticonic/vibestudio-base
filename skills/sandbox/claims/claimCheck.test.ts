import { describe, expect, it } from "vitest";
import excerpt from "./claimCheck/excerpt.js";
import matchedSpan from "./claimCheck/matchedSpan.js";
import quoteFor from "./claimCheck/quoteFor.js";
import spans from "./claimCheck/spans.js";

const REPORT = [
  "Stored the document in the blob store.",
  "",
  "- Digest: `3f9a…` (64 hex characters).",
  "- Read back bytes 10-40 of the 212 stored; they match the original.",
  "1. The marker line was found once by the search.",
].join("\n");

describe("spans", () => {
  it("splits sentences and list items into exact, trimmed slices without their markers", () => {
    const read = spans(REPORT);
    expect(read.map((span) => span.text)).toEqual([
      "Stored the document in the blob store.",
      "Digest: `3f9a…` (64 hex characters).",
      "Read back bytes 10-40 of the 212 stored; they match the original.",
      "The marker line was found once by the search.",
    ]);
    for (const span of read) expect(REPORT.slice(span.start, span.end)).toBe(span.text);
  });

  it("splits sentences on one line", () => {
    expect(spans("It worked. The size is 4 bytes! Done?").map((span) => span.text)).toEqual([
      "It worked.",
      "The size is 4 bytes!",
      "Done?",
    ]);
  });
});

describe("quoteFor", () => {
  it("quotes the span that shares the most words with the claim", () => {
    expect(quoteFor(REPORT, "A search found the marker line.")).toBe(
      "The marker line was found once by the search.",
    );
    expect(quoteFor(REPORT, "A smaller byte range was read back.")).toBe(
      "Read back bytes 10-40 of the 212 stored; they match the original.",
    );
  });

  it("quotes nothing when no span shares a word", () => {
    expect(quoteFor(REPORT, "Quarterly revenue grew.")).toBeNull();
  });
});

describe("matchedSpan", () => {
  it("returns the whole span holding the match", () => {
    expect(matchedSpan(REPORT, "\\bgrep|search")).toBe("The marker line was found once by the search.");
    expect(matchedSpan(REPORT, "teleport")).toBeNull();
  });
});

describe("excerpt", () => {
  it("passes a short text whole", () => {
    expect(excerpt(REPORT, "anything")).toBe(REPORT);
  });

  it("keeps the spans nearest the claim, in text order, within the limit", () => {
    const long = [
      ...Array.from({ length: 40 }, (_, index) => `Filler sentence number ${index} about nothing.`),
      "The tree diff changed one file.",
    ].join(" ");
    const read = excerpt(long, "The diff of the two trees changed one file.", 200);
    expect(read.length).toBeLessThanOrEqual(200);
    expect(read).toContain("The tree diff changed one file.");
  });
});
