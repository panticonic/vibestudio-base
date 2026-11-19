import type { MediaImportReport } from "../media-and-import-review/types.js";
import type { MediaImportWorld } from "./worlds.js";

export function verifyMediaImportWorld(
  world: MediaImportWorld,
  observed: MediaImportReport,
): boolean {
  return (
    observed.findings.length === world.expected.length &&
    world.expected.every((target, index) => {
      const finding = observed.findings[index];
      if (
        !finding ||
        finding.check !== target.check ||
        finding.disposition !== target.disposition ||
        finding.transcript !== target.transcript ||
        !finding.detail.trim() ||
        finding.evidenceIds.length !== target.evidenceIds.length ||
        finding.evidenceIds.some(
          (id, position) => id !== target.evidenceIds[position],
        )
      )
        return false;
      if (
        finding.disposition === "stream-error" ||
        finding.disposition === "integrity-error"
      ) {
        const originalError = world.request.speech?.evidence?.error;
        if (originalError && !finding.detail.includes(originalError))
          return false;
      }
      return true;
    })
  );
}
