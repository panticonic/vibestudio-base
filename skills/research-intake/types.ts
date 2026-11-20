export type Intent = "research" | "comparison" | "integration";
export type SearchReceipt = {
  id: string;
  query: string;
  urls: string[];
  outcome: "results" | "empty" | "failed";
};
export type ReadPassage = {
  digest: string;
  offset: number;
  limit: number;
  bytes: number;
  nextOffset: number;
  text: string;
};
export type SourceReceipt = {
  id: string;
  requestedUrl: string;
  finalUrl: string;
  title: string;
  authority: "primary" | "secondary";
  outcome: "fetched" | "blocked" | "empty" | "failed";
  session: "public" | "browser";
  browserApproved: boolean;
  digest: string | null;
  size: number;
  head: string;
  headBytes: number;
  truncated: boolean;
  reads: ReadPassage[];
  publicationDate: string | null;
  eventDate: string | null;
};
export type IntegrationReceipt = {
  id: string;
  endpoint: string;
  method: string;
  transport: "http" | "git";
  documented: boolean;
  matchedAudience: boolean | null;
  phase:
    | "no-attempt"
    | "matched"
    | "missing"
    | "needs-approval"
    | "denied"
    | "cancelled"
    | "response"
    | "provider-error"
    | "transport-error";
  requestBoundToEndpoint: boolean;
  responseStatus: number | null;
  responseShape: "match" | "mismatch" | "unavailable";
};
export type ResearchIntakeRequest = {
  goal: string;
  checks: Intent[];
  suppliedUrls: string[];
  search: SearchReceipt[];
  pages: SourceReceipt[];
  integration: IntegrationReceipt | null;
};
export type EvidenceCitation = {
  sourceId: string;
  url: string;
  quote: string;
  date: string | null;
};
export type ResearchDisposition =
  | "supported"
  | "search-only"
  | "no-evidence"
  | "access-held"
  | "readback-invalid"
  | "more-reading"
  | "corroborated"
  | "conflicting"
  | "superseded"
  | "incomparable"
  | "unresolved"
  | "configure-provider"
  | "approval-required"
  | "ended"
  | "document-endpoint"
  | "wrong-audience"
  | "request-unconfirmed"
  | "ready"
  | "schema-mismatch"
  | "retry-transport"
  | "provider-error";
export type ResearchFinding = {
  check: Intent;
  disposition: ResearchDisposition;
  evidenceIds: string[];
  citations: EvidenceCitation[];
  detail: string;
};
export type ResearchIntakeReport = { findings: ResearchFinding[] };
export type LiveResearchIntakeRequest = { goal: string; operationId: string };
export type ReceiptState = "usable" | "held" | "missing" | "invalid";
