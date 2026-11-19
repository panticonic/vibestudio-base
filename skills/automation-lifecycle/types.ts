export type LifecycleAction = "pause" | "resume";
export type LifecycleRequest = {
  goal: string;
  missionId: string;
  revisionDigest: string;
  action: LifecycleAction;
};
export type LifecycleState = "active" | "paused" | "completed" | "retired";
export type MissionObservation = {
  missionId: string;
  revisionDigest: string;
  state: LifecycleState;
};
export type LifecycleDecision = "apply" | "unchanged" | "held";
export type LifecycleReceipt =
  | "acknowledged"
  | "already"
  | "blocked"
  | "uncertain";
export type LifecycleReport = {
  missionId: string;
  status: "applied" | "reconciled" | "unchanged" | "held" | "uncertain";
  state: LifecycleState | null;
  revisionDigest: string | null;
};
