export type LocalRole = "author" | "reviewer" | "reader" | "none";
export type Purpose = "inspect" | "review-note" | "reader-note" | "author-note";
export type ShareCard = { id: string; workspace: string; title: string; revision: string };
export type ShareAssignment = { goal: string; workspace: string; document: string; user: string; purpose: Purpose; candidates: ShareCard[] };
export type ShareObservation = {
  object: ShareCard & { author: string; digest: string };
  session: { admitted: boolean; accountRole: "root" | "admin" | "member" };
  member: { accountRole: "root" | "admin" | "member"; workspaceRole: "admin" | "member" | null; active: boolean; revoked: boolean };
  invitation: { user: string | null; channel: string | null; revision: number | null;
    currentRevision: number; member: boolean; action: "put" | "delete"; inbox: "pending" | "acknowledged" | "absent"; exact: boolean };
  approval: { workspace: string; document: string; revision: string; digest: string; recipient: string; invitationRevision: number;
    role: LocalRole; status: "approved" | "pending" | "declined" | "withdrawn" };
};
export type ShareDecision = "hold-workspace" | "hold-recipient" | "hold-revoked" | "hold-membership" | "hold-revision" |
  "hold-invite" | "hold-declined" | "hold-pending" | "hold-role" | "inspect-current" |
  "stage-author" | "stage-reviewer" | "stage-reader";
export type ShareReceipt = { path: string; bytes: number; sha256: string };
