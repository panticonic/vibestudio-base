export type WebhookAdmissionTarget = { source: string; className: string; objectKey: string; method: string };
export type WebhookAdmissionRow = {
  id: string; label: string; target: WebhookAdmissionTarget; createdAt: number; updatedAt: number;
  revokedAt: number | null; delivery: string; maxBodyBytes: number; payload: string;
  replayKind: string | null; replayField: string | null; replayWindow: number | null;
  successStatus: number; malformed: string; dispatch: string; verifierKind: string; hasSecret: boolean;
};
export type WebhookAdmissionRequirement = "target" | "payload" | "body-limit" | "replay-key" | "replay-window" |
  "retry" | "malformed" | "status" | "full";
export type WebhookAdmissionAssignment = {
  id: string; goal: string; label: string; contextId: string; registration: string; mayStage: boolean;
  requirement: WebhookAdmissionRequirement; target: WebhookAdmissionTarget; minBody: number;
  replayField: string; minReplayWindow: number; successStatus: number;
};
export type WebhookAdmissionWitness = {
  contextId: string; registration: string; createdAt: number; updatedAt: number; digest: string;
};
export type WebhookAdmissionEvidence = {
  witness: WebhookAdmissionWitness | null; retainedDigest: string | null; rowDigest: string | null;
  active: WebhookAdmissionRow[]; history: WebhookAdmissionRow[];
};
export type WebhookAdmissionBinding = {
  row: WebhookAdmissionRow | null; hold: "hold-record" | "hold-scope" | "hold-revoked" | "hold-receipt" | null;
};
export type WebhookAdmissionDecision = "stage-audit" | "report-only" | "hold-record" | "hold-scope" |
  "hold-revoked" | "hold-receipt" | "hold-target" | "hold-payload" | "hold-body-limit" | "hold-replay-key" |
  "hold-replay-window" | "hold-retry" | "hold-malformed" | "hold-status";
export type WebhookAdmissionAssessment = { disposition: WebhookAdmissionDecision; reason: string };
export type WebhookAdmissionReceipt = { path: string; bytes: number; sha256: string };
export type WebhookAdmissionOutcome = {
  assignment: WebhookAdmissionAssignment; evidence: WebhookAdmissionEvidence; binding: WebhookAdmissionBinding;
  assessment: WebhookAdmissionAssessment; handoff: WebhookAdmissionReceipt | null;
};
