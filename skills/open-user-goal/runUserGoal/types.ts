export type { IntentReport } from "./discoverScopedIntent/types.js";
export type { OwnedRouteReview } from "./chooseAuthorizedEvidenceRoute/types.js";
export type { CliRouteOutcome } from "./recoverCliRoute/types.js";
export type { LaunchReport } from "./reconcilePanelLaunchState/types.js";
export type { WorkspaceClaimReview } from "./reviewWorkspaceClaims/types.js";
export type { OperationsGoalOutcome } from "./coordinateOwnedOperations/types.js";
export type { BridgeDeliveryReport } from "./workOnBridgeDelivery/types.js";
export * from "./workOnAuthoringGoal/discovery/types.js";
export type { ReadinessReport as ApiReadinessReport } from "./workOnApiReadinessGoal/types.js";
export * from "./reviewWebhookAdmission/contract.js";
export * from "./reviewLogFollower/contract.js";
export * from "./reviewPtyContinuity/contract.js";
export * from "./reviewDevelopmentAudit/contract.js";
export * from "./recoverContentArchive/contract.js";
export * from "./reviewSystemRelease/contract.js";
export type { PanelSourceMigrationOutcome } from "./migratePanelSource/types.js";
export type { WorkspaceShareOutcome } from "./reviewWorkspaceShare/types.js";
export type { AgentCapabilityOutcome } from "./recoverAgentCapability/types.js";
export type { ChatContinuityReport } from "./workOnChatContinuity/types.js";
export type { ImageReport } from "./workOnImageCandidateGoal/types.js";
export type { ExtensionDossierOutcome } from "./reviewExtensionDossier/types.js";
export type { InstalledPackageOutcome } from "./reviewInstalledPackage/types.js";
export type { DeployedInterfaceOutcome } from "./reviewDeployedInterface/types.js";
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

