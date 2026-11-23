export type RunSample = {
  id: string;
  label: string;
  purpose: string;
  authorization: "initial" | "after-rejection" | "after-interruption";
};
export type RunProgram = {
  id: string;
  label: string;
  purpose: string;
  state: "active" | "archived";
  permission: "inspect" | "trial" | "verify-and-sign";
  samples: RunSample[];
};
export type RunInspection = {
  programId: string;
  revision: string;
  callable: string | null;
  evidence: unknown;
};
export type RunOutcome = "returned" | "rejected" | "interrupted";
export type StartedRun = { id: string; status: RunOutcome };
export type ProgramOutputReceipt = {
  id: string;
  sampleId: string;
  revision: string;
  status: RunOutcome;
  signatureAuthorized: boolean;
  verification: "verified" | "unchecked" | "mismatch" | "stale" | "failed";
  output: unknown;
  error: string | null;
  evidence: unknown;
};
export type SignedOutputReceipt = { path: string; sha256: string; receiptId: string; publicKey: string };
export type ProgramRunReview = { kind: "program"; next: string; basis: string };
export type ProgramRunReport = | { status: "unresolved"; reason: "program-unavailable" | "run-not-bound" | "receipt-unavailable" }
  | { status: "reviewed"; programId: string; receipts: ProgramOutputReceipt[]; signed: SignedOutputReceipt | null };
