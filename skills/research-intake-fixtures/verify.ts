import type { ResearchIntakeReport } from "../research-intake/types.js";
import type { ResearchIntakeWorld } from "./worlds.js";

export function verifyResearchIntakeWorld(
  world: ResearchIntakeWorld,
  observed: ResearchIntakeReport,
): boolean {
  return (
    observed.findings.length === world.expected.length &&
    world.expected.every((target, index) => {
      const finding = observed.findings[index];
      if (
        !finding ||
        finding.check !== target.check ||
        finding.disposition !== target.disposition ||
        !finding.detail.trim() ||
        finding.evidenceIds.length !== target.evidenceIds.length ||
        finding.evidenceIds.some(
          (id, position) => id !== target.evidenceIds[position],
        ) ||
        finding.citations.length !== target.citations.length
      )
        return false;
      return target.citations.every((expected, position) => {
        const citation = finding.citations[position];
        if (
          !citation ||
          citation.sourceId !== expected.sourceId ||
          citation.url !== expected.url ||
          citation.date !== expected.date ||
          !citation.quote.includes(expected.quote)
        )
          return false;
        const page = world.request.pages.find(
          ({ id }) => id === citation.sourceId,
        );
        return (
          page !== undefined &&
          [page.head, ...page.reads.map(({ text }) => text)].some((text) =>
            text.includes(citation.quote),
          )
        );
      });
    })
  );
}
