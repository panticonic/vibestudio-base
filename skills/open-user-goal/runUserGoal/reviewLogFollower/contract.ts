export type FollowState = "seen" | "accepted" | "committed" | "failed" | "waiting" | "cleanup";
export type FollowCursor = { boot: string; seq: number };
export type FollowAssignment = { id: string; goal: string; subject: string; lane: string; request: string; saved: FollowCursor;
  limit: number; allowFresh: boolean; mayStage: boolean };
export type FollowRow = { seq: number; lane: string; request: string; state: FollowState; detail: string };
export type FollowCapture = {
  boot: string; workspace: string; epoch: string; opened: boolean; canceled: boolean;
  start: number; oldest: number | null; catchupThrough: number; witnessedThrough: number; lastSeen: number | null;
  overflow: boolean; query: FollowRow[]; live: FollowRow[];
};
export type FollowContinuity = "continued" | "fresh" | "hold-boot" | "hold-future" | "hold-expired" |
  "hold-window" | "hold-stream" | "hold-conflict";
export type FollowJoin = { continuity: FollowContinuity; boot: string; through: number | null; rows: FollowRow[]; duplicates: number[] };
export type FollowFinding = { state: FollowState | "unobserved"; citations: number[] };
export type FollowDecision = FollowFinding & { stage: boolean };
export type FollowReceipt = { path: string; bytes: number; sha256: string };
export type LogFollowerOutcome = { assignment: FollowAssignment; capture: FollowCapture; joined: FollowJoin;
  decision: FollowDecision; receipt: FollowReceipt | null };
