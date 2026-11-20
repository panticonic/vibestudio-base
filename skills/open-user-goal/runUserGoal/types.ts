export * from "./workOnAuthoringGoal/discovery/types.js";
export type { BuildIncidentOutcome } from "./reviewRetainedBuildIncident/types.js";
export type { DeployedInterfaceOutcome } from "./reviewDeployedInterface/types.js";
export type { LocalWidthOutcome } from "./reviewLocalExecutionWidth/types.js";
export * from "./workOnEvalHandoffGoal/journal/types.js";
export * from "./workOnProgramRunGoal/runtime/types.js";
export * from "./workOnTerminalGoal/types.js";

export type LocalReconciliationGoalReport = {
  integration: { status: "integrated" | "held"; head: string; reason: string };
  window: { title: string; window: "open" | "pending" | "closed"; note: string; head: string };
  handoff: { status: "none" | "held" | "staged"; artifact: { path: string; bytes: number } | null };
  archive?: {
    prior: { id: string; title: string; revision: string; setting: string; key: string; value: unknown; sha256: string };
    current: { exists: boolean; value: unknown };
    relation: "matches" | "changed";
  } | null;
};

export * from "./workOnCapabilityGoal/workspace/types.js";

export * from "./workOnAssemblyGoal/workspace/types.js";

export * from "./workOnRecoveryHandoff/types.js";

export * from "./workOnProblemReportGoal/types.js";

export type { DictationGoalReport } from "./workOnDictationHandoffGoal/types.js";
export type { SpecialistGoalReport } from "./workOnSpecialistHandoffGoal/types.js";
export * from "./workOnProviderHandoffGoal/types.js";
