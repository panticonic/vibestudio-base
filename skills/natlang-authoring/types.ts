export type ProgramRole = "candidate" | "baseline";
export type AuthoredFunction = {
  source: string;
  parameters: string[];
  returns: string;
};
export type CompilerIssue = {
  source: string;
  line: number;
  column: number;
  code: string;
  message: string;
};
export type ProgramReadback = CompiledProgram | RejectedProgram;
export type CompiledProgram = {
  role: ProgramRole;
  revision: string;
  state: "compiled";
  functions: AuthoredFunction[];
  services: string[];
};
export type RejectedProgram = {
  role: ProgramRole;
  revision: string;
  state: "rejected";
  diagnostics: CompilerIssue[];
};
export type AuthoringContract = {
  entry: string;
  expectedParameters: string[] | null;
  expectedReturn: string | null;
  declaredServices: string[] | null;
  requiredHelpers: string[];
  preserveBaseline: boolean;
};
export type AuthoringRequest = {
  goal: string;
  compare: boolean;
  contract: AuthoringContract;
};
export type AuthoringFinding = {
  code:
    | "compiler-error"
    | "missing-entry"
    | "parameter-change"
    | "return-change"
    | "missing-service"
    | "unexpected-service"
    | "missing-helper";
  subject: string;
  observed: string;
  recovery: string;
};
export type AuthoringReport = {
  status:
    | "ready"
    | "changes-required"
    | "candidate-rejected"
    | "baseline-rejected";
  candidateRevision: string;
  baselineRevision: string | null;
  findings: AuthoringFinding[];
};
