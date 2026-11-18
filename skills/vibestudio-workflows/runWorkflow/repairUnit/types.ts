export type SourceFile = { path: string; text: string };
export type Edit = { path: string; before: string; after: string };
export type Diagnostic = {
  source: string;
  severity: "error" | "warning";
  file: string;
  line: number;
  column: number;
  message: string;
  compilerCode?: number;
};
export type BuildReport = {
  stateHash: string;
  repoPath: string;
  status: "ok" | "failed" | "skipped";
  diagnostics: Diagnostic[];
  builds: { target: string; buildKey?: string | null }[];
};
export type TestReport = {
  status: string;
  runtime: "workerd";
  artifactKey?: string;
  executionDigest?: string;
  contextId: string;
  target: string;
  passed: number;
  failed: number;
  total: number;
  details: { file: string; status: string; errors?: string[] }[];
};
export type Receipt = {
  protocol: "unit-verification-receipt.v1";
  operation: "build" | "test";
  target: string;
  contextId: string;
  ref: string;
  stateHash: string;
  reportDigest: string;
  suite?: string;
  runtime?: "browser" | "workerd" | "native";
  artifactKey?: string | null;
  executionDigest?: string | null;
};
export type TestExecution = {
  operation: "test";
  target: string;
  status:
    | "passed"
    | "failed"
    | "no-tests"
    | "cancelled"
    | "infrastructure-error";
  report: TestReport;
  receipt: Receipt;
  truncatedFiles: number;
  truncatedErrors: number;
};
export type TestCompilationFailure = {
  operation: "test";
  target: string;
  status: "compilation-failed";
  report: { code: "TestCompilationFailed"; diagnostics: Diagnostic[] };
  receipt: Receipt;
  truncatedDiagnostics: number;
  truncatedDiagnosticText: number;
};
export type TestEvidence = TestExecution | TestCompilationFailure;
export type Evidence = {
  revision: string;
  build: BuildReport;
  tests: TestEvidence | null;
};
export type Diagnosis = {
  cause: string;
  evidence: string[];
  paths: string[];
  hypothesis: string;
};
export type Proposal = {
  edits: Edit[];
  rationale: string;
  preserves: string[];
};
export type Verification = {
  passed: boolean;
  evidence: string[];
  openQuestions: string[];
};
