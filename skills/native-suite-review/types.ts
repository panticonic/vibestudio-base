export type SuiteReviewRuntime = "native" | "workerd" | "browser";
export type SuiteReviewMode = "inspect" | "verify";
export type SuiteReviewRequest = {
  operationId: string;
  goal: string;
  target: string;
  suite: string;
  file: string | null;
  testName: string | null;
  mode: SuiteReviewMode;
};
export type SuiteReviewPlan = {
  target: string;
  suite: string;
  runtime: SuiteReviewRuntime;
  stateHash: string;
  contextId: string;
};
export type SuiteReviewExecution = {
  status: string;
  current: boolean;
  reportDigest: string | null;
  executionDigest: string | null;
  artifactKey: string | null;
  passed: number | null;
  failed: number | null;
  diagnostics: string[];
};
export type SuiteReviewRuntimeDecision = {
  runtime: SuiteReviewRuntime;
  nativeApproval: boolean;
  explanation: string;
};
export type SuiteReviewPlanDecision = {
  route: SuiteReviewRuntimeDecision;
  next: "report-plan" | "run-assignment";
};
export type SuiteReviewOutcome =
  | "verified"
  | "assertions-failed"
  | "compilation-failed"
  | "no-match"
  | "incomplete"
  | "stale";
export type SuiteReviewResultDecision = {
  outcome: SuiteReviewOutcome;
  followUp: string;
};
export type SuiteReviewReport = {
  plan: SuiteReviewPlan;
  decision: SuiteReviewPlanDecision;
  execution: SuiteReviewExecution | null;
  result: SuiteReviewResultDecision | null;
};
