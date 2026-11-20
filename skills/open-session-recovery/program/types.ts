export type RecoverySource = { id: string; title: string; description: string };
export type RecoveryNote = { channelId: string; messageId: string; seq: number; text: string };
export type RecoveryCursor = { channelId: string; seq: number };
export type RecoveryWindow = {
  source: RecoverySource;
  saved: RecoveryCursor;
  status: "complete" | "partial" | "foreign" | "caught-up" | "future";
  frontier: number | null;
  next: RecoveryCursor | null;
  notes: RecoveryNote[];
};
export type Disposition = "continue" | "hold" | "incomplete" | "caught-up";
export type RecoveryFinding = {
  disposition: Disposition;
  reason: string;
  citations: RecoveryNote[];
};
export type RecoveryArtifact = { path: string; sha256: string; citationIds: string[] };
export type RecoveryReport = { review: RecoveryFinding; handoff: RecoveryArtifact | null };
