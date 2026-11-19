import { describe, expect, it } from "vitest";
import checkReadback from "../research-intake/evidence/checkReadback.js";
import { projectPageReadback, projectSearchReadback } from "./project.js";
import { verifyResearchIntakeWorld } from "./verify.js";
import { researchIntakeWorlds } from "./worlds.js";

function get(id: string) {
  const world = researchIntakeWorlds.find(
    (item) => item.id === `research-intake-${id}`,
  );
  if (!world) throw new Error(`Missing case ${id}`);
  return world;
}
function answer(world: ReturnType<typeof get>) {
  return {
    findings: world.expected.map((item) => ({
      ...item,
      detail: "Report from the reference observations.",
    })),
  };
}

describe("Research intake exact evidence", () => {
  it("projects the real web contract without carrying query snippets or substituting the original URL", () => {
    const search = projectSearchReadback("discovery", {
      query: "trams",
      text: "Discovery text",
      sources: [{ url: "https://example.invalid", snippet: "Snippet" }],
    });
    expect(search).toEqual({
      id: "discovery",
      query: "trams",
      urls: ["https://example.invalid"],
      outcome: "results",
    });
    const page = projectPageReadback(
      {
        id: "source",
        requestedUrl: "https://example.invalid",
        authority: "primary",
        browserApproved: false,
        publicationDate: null,
        eventDate: null,
      },
      {
        url: "https://example.invalid/final",
        title: "Brief",
        digest: "receipt",
        size: 6,
        head: "Été.",
        headBytes: 6,
        truncated: false,
        servedFromCache: false,
        elapsedMs: 0,
        session: "public",
      },
      [],
    );
    expect(checkReadback(page)).toBe("usable");
    expect(checkReadback({ ...page, headBytes: 4 })).toBe("invalid");
    expect(page.finalUrl).toBe("https://example.invalid/final");
  });
  it("checks the assembled world references, uniqueness and anchored reference findings", () => {
    expect(new Set(researchIntakeWorlds.map(({ id }) => id)).size).toBe(47);
    for (const world of researchIntakeWorlds) {
      expect(verifyResearchIntakeWorld(world, answer(world)), world.id).toBe(
        true,
      );
    }
  });

  it("accepts an exact redirected source and rejects the requested URL substituted as its citation", () => {
    const world = get("supplied-url-redirect");
    const report = answer(world);
    expect(verifyResearchIntakeWorld(world, report)).toBe(true);
    report.findings[0]!.citations = report.findings[0]!.citations.map(
      (citation) => ({
        ...citation,
        url: world.request.suppliedUrls[0]!,
      }),
    );
    expect(verifyResearchIntakeWorld(world, report)).toBe(false);
  });

  it("keeps two original quotes for a discrepancy and rejects synthesized replacement text", () => {
    const world = get("same-scope-value-conflict");
    const report = answer(world);
    expect(verifyResearchIntakeWorld(world, report)).toBe(true);
    report.findings[0]!.citations = report.findings[0]!.citations.map(
      (citation) => ({
        ...citation,
        quote: citation.quote + " Reported average: 117.",
      }),
    );
    expect(verifyResearchIntakeWorld(world, report)).toBe(false);
  });

  it("rejects a matching quote when its authorisation or byte receipt was invalid", () => {
    expect(checkReadback(get("bounded-tail-support").request.pages[0]!)).toBe(
      "usable",
    );
    expect(checkReadback(get("wrong-read-digest").request.pages[0]!)).toBe(
      "invalid",
    );
    expect(
      checkReadback(get("mismatched-offset-advance").request.pages[0]!),
    ).toBe("invalid");
    expect(
      checkReadback(get("recorded-browser-approval-absent").request.pages[0]!),
    ).toBe("held");
  });

  it("keeps provider decisions ordered separately from a factual citation", () => {
    const world = get("citations-and-approval");
    const report = answer(world);
    expect(verifyResearchIntakeWorld(world, report)).toBe(true);
    expect(verifyResearchIntakeWorld({ ...world, id: "alias" }, report)).toBe(
      true,
    );
    expect(
      verifyResearchIntakeWorld(world, {
        findings: [...report.findings].reverse(),
      }),
    ).toBe(false);
  });
});
