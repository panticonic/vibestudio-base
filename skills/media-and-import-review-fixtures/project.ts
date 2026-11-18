import type {
  GitImportResult,
  GitUpstreamStatusRow,
} from "@vibestudio/service-schemas/gitInterop";
import type { SpeechEvent } from "@workspace/speech";
import type {
  PdfIngestResult,
  PdfProbeResult,
} from "../../extensions/pdf-ingest/pdf/types.js";
import type {
  GitImportEvidence,
  GitStatusEvidence,
  PdfEvidence,
  SpeechEvidence,
} from "../media-and-import-review/types.js";

export function projectPdfReadback(
  id: string,
  result: PdfProbeResult | PdfIngestResult,
): PdfEvidence {
  return {
    id,
    digest: result.document.digest,
    pageCount: result.document.pageCount,
    encrypted: result.document.encrypted,
    selectedPages:
      "selectedPages" in result
        ? [...result.selectedPages]
        : result.pages.map(({ pageNumber }) => pageNumber),
    pages:
      "pages" in result
        ? result.pages.map(
            ({
              pageNumber,
              extractionMethod,
              lines,
              imageArtifactId,
              warnings,
            }) => ({
              pageNumber,
              extractionMethod,
              lines: lines.map((line) => ({ ...line, bbox: [...line.bbox] })),
              imageArtifactId: imageArtifactId ?? null,
              warnings: [...warnings],
            }),
          )
        : [],
    engines: result.engines.map(({ id, available, bundled }) => ({
      id,
      available,
      bundled,
    })),
  };
}

export function projectSpeechReadback(
  assignment: Omit<SpeechEvidence, "events">,
  events: readonly SpeechEvent[],
): SpeechEvidence {
  return { ...assignment, events: events.map((entry) => ({ ...entry })) };
}

export function projectGitStatus(
  id: string,
  result: GitUpstreamStatusRow,
): GitStatusEvidence {
  return {
    id,
    repoPath: result.repoPath,
    remote: result.remote ?? null,
    branch: result.branch ?? null,
    state: result.state,
    observedAt: result.observedAt ?? null,
    lastSuccessfulObservationAt: result.lastSuccessfulObservationAt ?? null,
    remoteBranchExists: result.remoteBranchExists ?? null,
    candidate: result.candidate ? { ...result.candidate } : null,
  };
}

export function projectGitImport(
  id: string,
  result: GitImportResult,
): GitImportEvidence {
  const {
    sourceUri,
    sourceKind,
    snapshotRevision,
    snapshotDigest,
    canonicalSnapshot,
    targetRepositoryIds,
  } = result.semanticEvidence.externalSnapshot;
  return {
    id,
    contextId: result.contextId,
    eventId: result.eventId,
    sourceUri,
    sourceKind,
    revision: snapshotRevision,
    snapshotDigest,
    canonicalSnapshot: canonicalSnapshot ?? null,
    targetRepositoryIds: [...targetRepositoryIds],
  };
}
