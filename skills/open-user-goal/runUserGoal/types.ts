export * from "./workOnAuthoringGoal/discovery/types.js";
export * from "./workOnEvalHandoffGoal/journal/types.js";
export * from "./workOnProgramRunGoal/runtime/types.js";

export type LocalReconciliationGoalReport = {
  integration: { status: "integrated" | "held"; head: string; reason: string };
  window: { title: string; window: "open" | "pending" | "closed"; note: string; head: string };
  handoff: { status: "none" | "held" | "staged"; artifact: { path: string; bytes: number } | null };
};
