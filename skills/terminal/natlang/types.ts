export type TerminalCheck = {
  id: string;
  purpose: string;
  mode: "argv" | "script";
  prerequisites: string[];
};
export type TerminalCheckRequest = { goal: string; operationId: string };
export type TerminalPlan = { receipt: string; checks: TerminalCheck[] };
export type TerminalCheckResult = {
  receipt: string;
  id: string;
  status: "complete" | "unavailable";
  exitCode: number | null;
  timedOut: boolean;
  truncated: boolean;
  stdout: string;
  stderr: string;
};
export type TerminalCheckStatus =
  | "passed"
  | "failed"
  | "timed-out"
  | "output-truncated"
  | "unavailable";
export type TerminalCheckOutcome = {
  result: TerminalCheckResult;
  status: TerminalCheckStatus;
};
export type TerminalCheckReport = {
  assignmentReceipt: string;
  outcomes: TerminalCheckOutcome[];
  held: string[];
};
