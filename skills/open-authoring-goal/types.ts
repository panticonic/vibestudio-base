export type AuthoringSource = {
  id: string;
  label: string;
  product: string;
  state: "candidate" | "released" | "withdrawn";
  note: string;
};

export type AuthoringSelection = { candidateId: string; baselineId: string | null };
export type SelectedAuthoring = {
  selection: AuthoringSelection;
  request: { goal: string; compare: boolean; contract: unknown };
};
export type ObservedAuthoringReview = {
  status: "ready" | "changes-required" | "candidate-rejected" | "baseline-rejected";
  candidateRevision: string;
  baselineRevision: string | null;
  findings: { code: string; subject: string; observed: string; recovery: string }[];
};
export type MissingAuthoringRecord = "cannot-identify-candidate" | "cannot-identify-approved-release";
export type AuthoringChoice =
  | { kind: "select"; selection: AuthoringSelection }
  | { kind: "hold"; reason: MissingAuthoringRecord };
export type UnresolvedAuthoring = {
  status: "unresolved";
  reason: MissingAuthoringRecord | "cannot-bind-scope" | "source-kept-changing";
};
export type AuthoringDiscoveryOutcome =
  | { status: "selected"; value: SelectedAuthoring }
  | UnresolvedAuthoring;
export type AuthoringReceipt = {
  selection: AuthoringSelection;
  review: ObservedAuthoringReview;
};
export type AuthoringHandoff = { path: string; revision: string };
export type AuthoringOpenOutcome =
  | UnresolvedAuthoring
  | { status: "reviewed"; receipt: AuthoringReceipt; artifact: AuthoringHandoff | null };
