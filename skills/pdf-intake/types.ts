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
