import type { OperationsReport, OperationsRequest } from "./roles/types.js";

export type OperationsDocket = {
  id: string;
  title: string;
  revision: string;
  kind: OperationsRequest["kind"];
  edition: "current" | "retired";
};

export type OperationsDocketEvidence = {
  docket: OperationsDocket;
  authority: "local-exercise" | "review-only";
  rationale: string;
  retainWhenReady: boolean;
  request: OperationsRequest;
};

export type OperationsDossier = { path: string; digest: string };

export type OperationsGoalOutcome = {
  docket: OperationsDocket | null;
  operation: OperationsReport | null;
  dossier: OperationsDossier | null;
  disposition: "reviewed" | "held";
  reason: string;
};
