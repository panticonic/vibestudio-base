import { expect, it } from "vitest";
import combineBriefs from "./researchBrief/combineBriefs.js";
it("retains original quote and provenance bytes across investigation batches", () => {
  const citation = { url: "https://authority.example/record", title: "Original", quote: "Exact source sentence.",
    retrieved: "2026-11-23", published: null };
  const statement = { text: "An established fact.", cites: [citation] };
  const failed = { url: "search", reason: "Provider unavailable" };
  const combined = combineBriefs("The user's question", [
    { question: "The user's question", status: "insufficient", statements: [], notRead: [failed], rejected: 1 },
    { question: "The user's question", status: "answered", statements: [statement], notRead: [], rejected: 0 },
  ], [failed]);
  expect(combined).toEqual({ question: "The user's question", status: "answered", statements: [statement], notRead: [failed], rejected: 1 });
  expect(JSON.stringify(combined.statements[0]?.cites[0])).toBe(JSON.stringify(citation));
});
