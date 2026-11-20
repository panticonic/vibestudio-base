export type ScheduleState = "active" | "paused";
export type Schedule = {
  id: string; title: string; owner: string; group: string; revision: number; digest: string;
  state: ScheduleState; minutes: number; maxRuns: number | null; anchorAt: number; nextRunAt: number | null;
};
export type Change =
  | { kind: "cadence"; minutes: number }
  | { kind: "cap"; maxRuns: number }
  | { kind: "window"; minutes: number; maxRuns: number }
  | { kind: "pause" | "resume" };
export type Lane = { id: string; title: string; role: "decision" | "archive" | "handoff" };
export type Receipt = { messageId: string; lane: string; sender: string; sequence: number; text: string };
export type DecisionRecord = {
  disposition: "approved" | "proposed" | "withdrawn";
  schedule: string; owner: string; digest: string; change: Change;
  prerequisite?: { schedule: string; state: ScheduleState };
  destination?: string;
};
export type Review = { chosen: Receipt | null; decision: DecisionRecord | null; destination: Lane | null; reason: string };
export type Resolution = { status: "applied" | "unchanged" | "held" | "changed"; current: Schedule };
export type Submission = { attemptId: string; response: "recorded" | "interrupted" };
export type ScheduledOutcome = {
  schedule: Schedule; authorization: Receipt | null; delivery: Receipt | null; reason: string;
};
