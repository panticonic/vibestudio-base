import type {
  Disposition,
  GitImportEvidence,
  GitReview,
  GitStatusEvidence,
  MediaImportRequest,
  PdfEvidence,
  PdfPage,
  PdfReview,
  ReviewKind,
  SpeechEvidence,
  SpeechReview,
} from "../media-and-import-review/types.js";

type Expected = {
  check: ReviewKind;
  disposition: Disposition;
  evidenceIds: string[];
  transcript: string | null;
};
export type MediaImportWorld = {
  id: string;
  sourceGroup: string;
  request: MediaImportRequest;
  expected: Expected[];
};

function scenario(
  id: string,
  group: string,
  goal: string,
  input: Partial<MediaImportRequest>,
  expected: Expected[],
): MediaImportWorld {
  return {
    id: `media-import-${id}`,
    sourceGroup: `vibestudio:media-import:${group}`,
    request: {
      goal,
      checks: expected.map(({ check }) => check),
      pdf: null,
      speech: null,
      git: null,
      ...input,
    },
    expected,
  };
}
function pdfResult(
  evidence: PdfEvidence | null,
  disposition: Disposition,
): Expected {
  return {
    check: "pdf",
    disposition,
    evidenceIds: evidence ? [evidence.id] : [],
    transcript: null,
  };
}
function speechResult(
  evidence: SpeechEvidence | null,
  disposition: Disposition,
  transcript: string | null = null,
): Expected {
  return {
    check: "speech",
    disposition,
    evidenceIds: evidence ? [evidence.id] : [],
    transcript,
  };
}
function gitResult(
  status: GitStatusEvidence | null,
  imported: GitImportEvidence | null,
  disposition: Disposition,
): Expected {
  return {
    check: "git",
    disposition,
    evidenceIds: [
      ...(status ? [status.id] : []),
      ...(imported ? [imported.id] : []),
    ],
    transcript: null,
  };
}
const page1: PdfPage = {
  pageNumber: 1,
  extractionMethod: "embedded-text",
  lines: [
    {
      text: "05:30 gate opens",
      bbox: [12, 25, 165, 43],
      confidence: null,
      source: "embedded-text",
    },
  ],
  imageArtifactId: null,
  warnings: [],
};
const page2: PdfPage = {
  pageNumber: 2,
  extractionMethod: "ocr",
  lines: [
    {
      text: "Notify the keeper at dawn",
      bbox: [12, 25, 165, 43],
      confidence: 92,
      source: "ocr",
    },
  ],
  imageArtifactId: "image_2",
  warnings: [],
};
const basePdf: PdfEvidence = {
  id: "pdf-readback",
  digest: "owned-pdf",
  pageCount: 4,
  encrypted: false,
  selectedPages: [1, 2],
  pages: [page1, page2],
  engines: [
    { id: "pdfjs", available: true, bundled: true },
    { id: "tesseract-ocr", available: true, bundled: true },
  ],
};
function pdf(
  id: string,
  group: string,
  goal: string,
  need: PdfReview["need"],
  pages: number[],
  patch: Partial<PdfEvidence> | null,
  outcome: Disposition,
  min: number | null = null,
): MediaImportWorld {
  const evidence = patch === null ? null : { ...basePdf, ...patch };
  return scenario(
    id,
    group,
    goal,
    {
      pdf: {
        digest: basePdf.digest,
        requestedPages: pages,
        need,
        minimumOcrConfidence: min,
        evidence,
      },
    },
    [pdfResult(evidence, outcome)],
  );
}
const result = {
  type: "result",
  text: "Sprecht zuerst mit Marta.",
  model: "whistle",
  language: "de",
} as const;
const baseSpeech: SpeechEvidence = {
  id: "speech-readback",
  operationId: "op_410",
  generation: "verified",
  format: "pcm_f32le",
  sampleRate: 16000,
  channels: 1,
  inputBytes: 2816000,
  terminal: "completed",
  error: null,
  events: [{ type: "progress", message: "Processing window two" }, result],
};
function speech(
  id: string,
  group: string,
  goal: string,
  purpose: SpeechReview["purpose"],
  patch: Partial<SpeechEvidence> | null,
  outcome: Disposition,
  transcript: string | null = null,
): MediaImportWorld {
  const evidence = patch === null ? null : { ...baseSpeech, ...patch };
  return scenario(
    id,
    group,
    goal,
    { speech: { operationId: baseSpeech.operationId, purpose, evidence } },
    [speechResult(evidence, outcome, transcript)],
  );
}
const baseGit: GitStatusEvidence = {
  id: "upstream-readback",
  repoPath: "projects/ledger",
  remote: "origin",
  branch: "main",
  state: "ahead",
  observedAt: 1794999123123,
  lastSuccessfulObservationAt: 1794980000000,
  remoteBranchExists: true,
  candidate: null,
};
const fromImport: GitImportEvidence = {
  id: "import-readback",
  contextId: "ctx_import",
  eventId: "event_candidate",
  sourceUri: "https://source.example.invalid/repo.git",
  sourceKind: "git",
  revision: "7a33b38",
  snapshotDigest: `snapshot:${"1".repeat(64)}`,
  canonicalSnapshot: `v1-sha256:${"a".repeat(64)}`,
  targetRepositoryIds: ["repo_custody_1"],
};
const pending: Partial<GitStatusEvidence> = {
  state: "integration-required",
  candidate: { contextId: fromImport.contextId, eventId: fromImport.eventId },
};
function git(
  id: string,
  group: string,
  goal: string,
  mode: GitReview["mode"],
  patch: Partial<GitStatusEvidence> | null,
  imported: GitImportEvidence | null,
  outcome: Disposition,
  protectedMainEventId: string | null = "event_public",
) {
  const status = patch === null ? null : { ...baseGit, ...patch };
  return scenario(
    id,
    group,
    goal,
    {
      git: {
        repoPath: baseGit.repoPath,
        repositoryId: "repo_custody_1",
        remote: "origin",
        branch: "main",
        mode,
        protectedMainEventId,
        status,
        imported,
      },
    },
    [gitResult(status, imported, outcome)],
  );
}
export const mediaImportWorlds: MediaImportWorld[] = [
  pdf(
    "verified-embedded-text",
    "pdf-extraction",
    "Does the gate schedule have text on the first page?",
    "text",
    [1],
    {},
    "pdf-ready",
  ),
  pdf(
    "layout-needs-geometry",
    "pdf-extraction",
    "The receipt has flattened table text. Is there geometry for the first page?",
    "structure",
    [1],
    {
      pages: [
        { ...page1, lines: [{ ...page1.lines[0]!, bbox: [12, 25, 12, 43] }] },
      ],
    },
    "missing-layout",
  ),
  pdf(
    "layout-coordinates-confirmed",
    "pdf-extraction",
    "Check for geometry on both the shift roster and handwritten supplement.",
    "structure",
    [1, 2],
    {},
    "pdf-ready",
  ),
  pdf(
    "password-capable-followup",
    "pdf-source",
    "Find why the scanned deed could not be read.",
    "text",
    [1],
    { encrypted: true, pages: [] },
    "encrypted",
  ),
  pdf(
    "wrong-version",
    "pdf-source",
    "Check the digest for the guide whose cover I requested.",
    "text",
    [1],
    { digest: "other-guide" },
    "wrong-input",
  ),
  pdf(
    "probe-without-selected-content",
    "pdf-coverage",
    "Can the three-page probe establish page two's actual text?",
    "text",
    [2],
    { pages: [] },
    "missing-pages",
  ),
  pdf(
    "wrong-page-not-substitute",
    "pdf-coverage",
    "Verify receipt of the fourth requested page from this binder.",
    "text",
    [4],
    {},
    "missing-pages",
  ),
  pdf(
    "duplicate-page-receipt",
    "pdf-coverage",
    "Check that the image scan actually covers each requested leaf exactly once.",
    "image",
    [2],
    { pages: [page2, { ...page2, imageArtifactId: "duplicate" }] },
    "missing-pages",
  ),
  pdf(
    "matching-image-artifact",
    "pdf-artifact",
    "Check if the requested image of the handwritten supplement is ready.",
    "image",
    [2],
    {},
    "pdf-ready",
  ),
  pdf(
    "image-was-not-emitted",
    "pdf-artifact",
    "Confirm a page-one image exists before I send the image ID.",
    "image",
    [1],
    {},
    "missing-artifact",
  ),
  pdf(
    "local-ocr-data-unavailable",
    "pdf-ocr",
    "Check local OCR readiness for the translated appendix.",
    "ocr",
    [2],
    {
      engines: [
        { id: "tesseract-ocr", available: false, bundled: true },
        { id: "provider-native", available: true, bundled: false },
      ],
    },
    "ocr-unavailable",
  ),
  pdf(
    "ocr-confidence-below-request",
    "pdf-ocr",
    "Does the scan meet my specified 95 percent confidence?",
    "ocr",
    [2],
    {},
    "ocr-review",
    95,
  ),
  pdf(
    "ocr-confidence-confirmed",
    "pdf-ocr",
    "Can we rely on the local OCR scan at a minimum confidence of 90?",
    "ocr",
    [2],
    {},
    "pdf-ready",
    90,
  ),
  speech(
    "verify-prepared-generation",
    "speech-artifacts",
    "Is the offline engine prepared for recording?",
    "prepare",
    { events: [{ type: "ready" }] },
    "prepared",
  ),
  speech(
    "download-incomplete",
    "speech-artifacts",
    "Is the model usable during the observed download?",
    "prepare",
    {
      generation: "preparing",
      terminal: "open",
      events: [
        { type: "progress", message: "Downloading", completed: 2, total: 4 },
      ],
    },
    "preparing",
  ),
  speech(
    "damaged-sha-generation",
    "speech-artifacts",
    "The cached immutable resources failed the digest check. Explain the boundary.",
    "prepare",
    {
      generation: "integrity-error",
      terminal: "failed",
      error: "Whistle generation SHA-256 mismatch",
      events: [],
    },
    "integrity-error",
  ),
  speech(
    "terminal-cancellation",
    "speech-terminal",
    "Does a cancelled recording with a buffered result count as transcribed?",
    "dictate",
    { terminal: "cancelled" },
    "cancelled",
  ),
  speech(
    "original-engine-failure",
    "speech-terminal",
    "Review the original evidence when the offline worker fails while transcribing.",
    "dictate",
    {
      terminal: "failed",
      error: "Needle worker terminated",
      events: [{ type: "progress", message: "Processing window one" }],
    },
    "stream-error",
  ),
  speech(
    "progress-is-not-result",
    "speech-terminal",
    "The composer reached completion but only shows progress. Was there a transcript?",
    "dictate",
    { events: [{ type: "progress", message: "Transcribing three windows" }] },
    "missing-transcript",
  ),
  speech(
    "verbatim-multiwindow-result",
    "speech-terminal",
    "Report the speech result from the 44-second multi-window attempt.",
    "dictate",
    {},
    "transcript-ready",
    result.text,
  ),
  speech(
    "silence-result",
    "speech-terminal",
    "The speaker paused throughout the recording. What exactly did the transcription produce?",
    "dictate",
    { events: [{ ...result, text: "  " }] },
    "silence",
  ),
  speech(
    "input-stereo-rejected",
    "speech-pcm",
    "Does this PCM capture meet the offline inference envelope?",
    "dictate",
    { channels: 2 },
    "invalid-pcm",
  ),
  speech(
    "input-too-large",
    "speech-pcm",
    "Check whether the composer can submit the entire oversized recording without cutting it.",
    "dictate",
    { inputBytes: 4194308 },
    "invalid-pcm",
  ),
  git(
    "import-candidate-not-main",
    "git-candidate",
    "Is the imported repo already published or only an independent semantic candidate?",
    "observation",
    pending,
    fromImport,
    "unpublished-candidate",
  ),
  git(
    "candidate-from-sibling-repo",
    "git-candidate",
    "Verify that the candidate's own receipt names this repository.",
    "observation",
    pending,
    { ...fromImport, targetRepositoryIds: ["repo_elsewhere"] },
    "candidate-mismatch",
  ),
  git(
    "candidate-identity-not-joined",
    "git-candidate",
    "Can the comparison use the other observed context's candidate?",
    "export",
    pending,
    { ...fromImport, contextId: "ctx_second_import" },
    "candidate-mismatch",
  ),
  git(
    "candidate-status-blocks-export",
    "git-candidate",
    "Does the pending candidate permit automatic export without the import readback?",
    "export",
    pending,
    null,
    "needs-integration",
  ),
  git(
    "prior-counts-are-historical",
    "git-freshness",
    "What does the current upstream observation establish if the fetch failed?",
    "observation",
    { state: "fetch-failed", observedAt: null },
    null,
    "fetch-failed",
  ),
  git(
    "current-branch-really-absent",
    "git-freshness",
    "Is the configured branch absent from this successful remote observation?",
    "observation",
    { state: "local-only", remoteBranchExists: false },
    null,
    "missing-branch",
  ),
  git(
    "ahead-protected-event",
    "git-export",
    "Can this current protected-main event make an eligible explicit export plan?",
    "export",
    {},
    null,
    "export-eligible",
  ),
  git(
    "ahead-event-missing",
    "git-export",
    "The tracking ref is ahead but there is no independently observed protected event. Can I export?",
    "export",
    {},
    null,
    "no-exportable-event",
    null,
  ),
  git(
    "force-is-not-inferred",
    "git-export",
    "Check the safe disposition for this observed divergent upstream.",
    "export",
    { state: "diverged" },
    null,
    "upstream-diverged",
  ),
  scenario(
    "appendix-and-repository-custody",
    "mixed-import",
    "Check the ingested handbook appendix, then review whether the separately imported source repository reached protected main.",
    {
      pdf: {
        digest: basePdf.digest,
        requestedPages: [2],
        need: "structure",
        minimumOcrConfidence: null,
        evidence: basePdf,
      },
      git: {
        repoPath: baseGit.repoPath,
        repositoryId: "repo_custody_1",
        remote: "origin",
        branch: "main",
        mode: "observation",
        protectedMainEventId: "event_public",
        status: { ...baseGit, ...pending },
        imported: fromImport,
      },
    },
    [
      pdfResult(basePdf, "pdf-ready"),
      gitResult(baseGit, fromImport, "unpublished-candidate"),
    ],
  ),
];
