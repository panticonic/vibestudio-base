export type ExtractionMode = "embedded" | "local-fallback" | "local-ocr";
export type PdfIntakeRequest = {
  goal: string;
  document: string;
  pages: number[];
  batchSize: number;
  purpose: "text" | "layout" | "ocr";
  allowOcr: boolean;
  query: string;
};
export type ProbeReceipt = {
  digest: string;
  pageCount: number;
  selectedPages: number[];
  encrypted: boolean;
  embedded: boolean;
  localOcr: boolean;
};
export type IntakeLine = {
  text: string;
  bounds: number[];
  source: "embedded-text" | "ocr";
  confidence: number | null;
};
export type ExtractedPage = {
  number: number;
  lines: IntakeLine[];
};
export type BatchReceipt = { digest: string; pages: ExtractedPage[] };
export type IntakePlan =
  | "encrypted"
  | "missing-pages"
  | "engine-unavailable"
  | ExtractionMode;
export type Locator = { page: number; line: number };
export type EvidenceSelection = { locations: Locator[]; unanswered: string[] };
export type Citation = {
  page: number;
  line: number;
  quote: string;
  bounds: number[];
  source: "embedded-text" | "ocr";
  confidence: number | null;
};
export type PdfIntakeReport = {
  status:
    | "encrypted"
    | "missing-pages"
    | "engine-unavailable"
    | "verified"
    | "partial-match"
    | "no-match"
    | "incomplete";
  digest: string;
  readPages: number[];
  remaining: number[];
  citations: Citation[];
  unanswered: string[];
};

export type PdfLayoutRequest = { operationId: string; goal: string };
export type PdfLayoutFragment = { text: string; bounds: number[] };
export type PdfLayoutPage = {
  digest: string;
  pageNumber: number;
  width: number;
  height: number;
  rows: PdfLayoutFragment[][];
};
export type PdfLayoutDecision = {
  kind: "table" | "columns" | "sequence" | "uncertain";
  basis: string;
};
export type PdfFragmentLocation = { row: number; fragment: number };
export type PdfLayoutReading = {
  status: "ordered" | "uncertain";
  entries: (PdfFragmentLocation & PdfLayoutFragment)[];
};
export type PdfLayoutReport = {
  digest: string;
  pageNumber: number;
  layout: PdfLayoutDecision;
  reading: PdfLayoutReading;
};

export type PdfGoalFile = {
  name: string;
  digest: string;
  pageCount: number;
  encrypted: boolean;
};
export type PdfGoalObservation = { revision: string; documents: PdfGoalFile[] };
export type PdfGoalSelection = {
  document: string;
  pages: number[];
  textQuery: string | null;
  layoutPages: number[];
  renderPages: number[];
};
export type PdfGoalBinding = {
  document: PdfGoalFile;
  missingPages: number[];
  text: PdfIntakeRequest | null;
  layouts: PdfLayoutRequest[];
  visual: { operationId: string; pages: number[] } | null;
};
export type PdfGoalRender = {
  documentDigest: string;
  pageNumber: number;
  artifactId: string;
  imageDigest: string;
  width: number;
  height: number;
  inkPixels: number;
  inkBounds: number[] | null;
};
export type PdfGoalRecommendation = {
  action: "preserve-text" | "preserve-table-rows" | "read-columns-in-order" |
    "provide-text-equivalent" | "recover-missing-pages" | "keep-page-specific-structure" | "needs-review";
  rationale: string;
};
export type PdfGoalReport =
  | {
    status: "inspected";
    document: PdfGoalFile;
    selection: PdfGoalSelection;
    missingPages: number[];
    text: PdfIntakeReport | null;
    layouts: PdfLayoutReport[];
    rendered: PdfGoalRender[];
    recommendation: PdfGoalRecommendation;
  }
  | { status: "blocked"; reason: string };
