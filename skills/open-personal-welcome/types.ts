export type WelcomeIntent = "welcome" | "refresh" | "selection" | "workspace-creation";
export type OwnerState = "connected" | "connected-unverified" | "configured" | "using-defaults" |
  "not-configured" | "in-progress" | "needs-attention" | "unavailable" | "unknown";
export type WelcomeResource = {
  id: string;
  title: string;
  kind: "setup" | "tour" | "explorer" | "chooser";
  sender: string;
  scope: string;
};
export type WelcomeScope = {
  contextId: string;
  channelId: string;
  revision: string;
  intent: WelcomeIntent;
  mayRetry: boolean;
  mayStage: boolean;
};
export type WelcomeIndex = { scope: WelcomeScope; resources: WelcomeResource[] };
export type TourFrame = { storedScene: string; storedNotes: boolean; eyebrow: string; heading: string; progress: string; notesVisible: boolean };
export type TourScene = { id: string; title: string; position: number; eyebrow: string };
export type TourStop = { topic: string; scene: TourScene; notes: boolean };
export type SetupRoute = { capabilityId: string; action: string; via: "owner-skill" | "about-page" |
  "model-settings" | "panel" | "shell-navigation" | "conversation"; destination: string | null };
export type RecordHeader = { resourceId: string; sender: string; contextId: string; revision: string };
export type WelcomeRecord = RecordHeader & (
  | { kind: "owner"; state: OwnerState; observed: boolean }
  | { kind: "selection"; action: string }
  | { kind: "welcome"; state: "retained" }
  | { kind: "tour"; frame: TourFrame; expectedNotes: boolean }
  | { kind: "probe"; state: "interrupted" | "completed"; digest: string }
  | { kind: "decision"; state: "paused" | "deferred" | "retained" }
);
export type WelcomeRow = { messageId: string; envelopeId: string; seq: number; record: WelcomeRecord };
export type WelcomeSnapshot = { channelId: string; through: number; rows: WelcomeRow[] };
export type OwnerObservation = { receipt: string; rows: { id: string; state: OwnerState; observed: boolean }[]; route: SetupRoute | null };
export type SetupReview = OwnerObservation & { status: string; unknown: string[]; needsVerification: string[] };
export type SetupWitness = { request: { goal: string; intent: WelcomeIntent }; result: SetupReview };
export type TourWitness = { stop: TourStop; frame: TourFrame; sceneCount: number; result: { frame: TourFrame; stage: "verified" | "mismatch" } };
export type ExplorerInput = { bytes: number; characters: number; digest: string; lineEnding: "lf" | "crlf" | "mixed" | "none";
  claim: "reports-bytes" | "reports-characters" | "normalizes-line-endings" | null; repeat: boolean };
export type ExplorerPlan = { expectedBytes: number; expectedDigest: string; comparison: "round-trip" | "repeat-store";
  check: "utf8-size" | "line-endings" | "exact-content" };
export type ExplorerReceipt = {
  blob: { digest: string; writtenBytes: number; exists: boolean; statBytes: number | null; readDigest: string | null; repeatDigest: string | null };
  file: { digest: string; bytes: number; removed: boolean };
};
export type ExplorerReport = {
  input: ExplorerInput; plan: ExplorerPlan; receipt: ExplorerReceipt;
  assessment: { classification: "ok" | "bug" | "doc-mismatch"; issue: "content" | "byte-count" | "repeat" | "cleanup" | "claim" | null };
  next: string;
};
export type ExplorerRequest = { operationId: string; goal: string };
export type ExplorerWitness = { request: ExplorerRequest; result: ExplorerReport };
export type WelcomeResolution = { resourceId: string; route: SetupRoute | null; scene: TourScene | null; sceneCount: number; guidance: string[];
  probe: ExplorerRequest | null };
export type WelcomeReason = "verified-current" | "owner-unknown" | "needs-verification" | "stale-receipt" | "foreign-sender" |
  "wrong-context" | "invalid-route" | "welcome-retained" | "separate-workspace" | "tour-frame-mismatch" | "missing-evidence" |
  "already-complete" | "retry-ready" | "local-retry-complete" | "retry-unauthorized" | "no-resource" | "ambiguous-resource" | "preference-preserved";
export type WelcomeChoice = { id: string | null; reason: "selected" | "no-resource" | "ambiguous-resource" };
export type WelcomeEvidence = { message: string | null; sender: string | null; reason: WelcomeReason };
export type WelcomePlan = WelcomeEvidence & { resourceId: string | null; channelId: string; through: number;
  action: "hold" | "report" | "stage"; explanation: string };
export type WelcomeHandoff = { path: string; bytes: number; sha256: string };
export type WelcomeReviews = { setup: SetupWitness | null; tour: TourWitness | null; probe: ExplorerWitness | null };
export type WelcomeGoalReport = { plan: WelcomePlan; reviews: WelcomeReviews; handoff: WelcomeHandoff | null };
