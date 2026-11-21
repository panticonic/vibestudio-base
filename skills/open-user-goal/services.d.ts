declare module "natlang:services" {
  export const problemIncident: {
    discover(): Promise<import("./runUserGoal/workOnProblemReportGoal/types.js").IncidentCard[]>;
    open(incident: string): Promise<{ operationId: string } | null>;
  };
}
declare module "natlang:services" {
  export const recoveryHandoffLink: {
    discover(): Promise<import("./runUserGoal/workOnRecoveryHandoff/contract.js").RecoveryHandoffDirective>;
    prepare(jobId: string, runId: string, runDigest: string, resultDigest: string, digest: string,
      directive: import("./runUserGoal/workOnRecoveryHandoff/contract.js").RecoveryHandoffDirective
    ): Promise<import("./runUserGoal/workOnRecoveryHandoff/contract.js").RecoveryHandoffInput>;
  };
  export const buildIncidentCatalog: {
    discover(): Promise<import("./runUserGoal/reviewRetainedBuildIncident/contract.js").IncidentSurvey>;
    open(id: string): Promise<import("./runUserGoal/reviewRetainedBuildIncident/contract.js").RetainedProfile>;
  };
  export const buildIncidentHandoff: {
    stage(checkpoints: string[], focus: import("./runUserGoal/reviewRetainedBuildIncident/contract.js").IncidentFocus):
      Promise<import("./runUserGoal/reviewRetainedBuildIncident/contract.js").IncidentReceipt | null>;
  };
  export const mobileContinuity: {
    discover(): Promise<import("./types.js").MobileContinuityCard[]>;
    profile(id: string): Promise<import("./types.js").MobileContinuityProfile>;
    build(id: string): Promise<import("./types.js").MobileBuildEvidence>;
    cache(id: string): Promise<import("./types.js").MobileCacheEvidence>;
    transport(id: string): Promise<import("./types.js").MobileTransportEvidence>;
    routes(id: string): Promise<import("./types.js").MobileRouteEvidence>;
  };
  export const assetHistory: {
    discover(): Promise<import("./types.js").AssetVersion[]>;
    listFiles(version: string): Promise<import("./types.js").AssetFile[]>;
    inspect(version: string, fileId: string): Promise<import("./types.js").AssetRead>;
  };
  export const assetRecovery: {
    stage(source: string, working: string, selection: import("./types.js").AssetSelection[]): Promise<import("./types.js").AssetStageResult>;
  };
  export const tendrilRouteRead: {
    listBoards(): Promise<import("./types.js").TendrilBoardCard[]>;
    readBoard(id: string): Promise<import("./types.js").TendrilRouteSnapshot>;
    probe(id: string, slot: string, revision: string): Promise<import("./types.js").TendrilRouteProbe>;
  };
  export const tendrilRouteRetention: {
    retain(finding: import("./types.js").TendrilRouteFinding): Promise<import("./types.js").TendrilRouteReceipt | null>;
  };
  export const presentationRecords: {
    discover(): Promise<import("./types.js").PresentationSourceCard[]>;
    read(id: string): Promise<import("./types.js").LocalPresentationSource>;
    preview(id: string, revision: string, report: unknown): Promise<import("./types.js").PreviewDisposition>;
  };
  export const localWidthEvidence: {
    discover(): Promise<import("./runUserGoal/reviewLocalExecutionWidth/contract.js").WidthSurvey>;
    readWitness(id: string): Promise<import("./runUserGoal/reviewLocalExecutionWidth/contract.js").WidthReceipt>;
  };
  export const localWidthHandoff: {
    stage(finding: import("./runUserGoal/reviewLocalExecutionWidth/contract.js").WidthFinding):
      Promise<import("./runUserGoal/reviewLocalExecutionWidth/contract.js").WidthHandoff | null>;
  };
  export const interfaceEvidence: {
    discover(): Promise<import("./runUserGoal/reviewDeployedInterface/contract.js").InterfaceSurvey>;
    inspect(id: string): Promise<import("./runUserGoal/reviewDeployedInterface/contract.js").InterfaceObservation>;
  };
  export const interfaceReviewHandoff: {
    stage(observation: import("./runUserGoal/reviewDeployedInterface/contract.js").InterfaceObservation,
      decision: import("./runUserGoal/reviewDeployedInterface/contract.js").InterfaceDecision):
      Promise<import("./runUserGoal/reviewDeployedInterface/contract.js").InterfaceHandoff | null>;
  };
  export const extensionDossierRead: {
    discover(): Promise<import("./runUserGoal/reviewExtensionDossier/contract.js").DossierAssignment>;
    candidate(operationId: string): Promise<import("./runUserGoal/reviewExtensionDossier/contract.js").ManifestDelta>;
    history(operationId: string): Promise<import("./runUserGoal/reviewExtensionDossier/contract.js").ReleaseHistory>;
  };
  export const extensionDossierWrite: {
    stage(decision: import("./runUserGoal/reviewExtensionDossier/contract.js").DossierDecision):
      Promise<import("./runUserGoal/reviewExtensionDossier/contract.js").DossierReceipt | null>;
  };
  export const installedPackageRead: {
    discover(): Promise<import("./runUserGoal/reviewInstalledPackage/contract.js").PackageAssignment>;
    inspect(operationId: string): Promise<import("./runUserGoal/reviewInstalledPackage/contract.js").PackageObservation>;
  };
  export const installedPackageChange: {
    restore(operationId: string, workingRevision: string, workingDigest: string):
      Promise<import("./runUserGoal/reviewInstalledPackage/contract.js").PackageRestore>;
  };
  export const panelMigrationEvidence: {
    discover(): Promise<import("./runUserGoal/migratePanelSource/contract.js").PanelMigrationAssignment>;
    inspect(id: string): Promise<import("./runUserGoal/migratePanelSource/contract.js").MigrationObservation>;
  };
  export const panelMigrationChange: {
    move(id: string, head: string): Promise<import("./runUserGoal/migratePanelSource/contract.js").MigrationReceipt>;
    align(id: string, head: string, manifestDigest: string): Promise<import("./runUserGoal/migratePanelSource/contract.js").MigrationReceipt>;
    update(id: string, head: string, guideDigest: string): Promise<import("./runUserGoal/migratePanelSource/contract.js").MigrationReceipt>;
  };
  export const workspaceShareEvidence: {
    discover(): Promise<import("./runUserGoal/reviewWorkspaceShare/contract.js").ShareAssignment>;
    inspect(id: string): Promise<import("./runUserGoal/reviewWorkspaceShare/contract.js").ShareObservation>;
  };
  export const workspaceShareHandoff: {
    stage(observation: import("./runUserGoal/reviewWorkspaceShare/contract.js").ShareObservation,
      decision: import("./runUserGoal/reviewWorkspaceShare/contract.js").ShareDecision):
      Promise<import("./runUserGoal/reviewWorkspaceShare/contract.js").ShareReceipt | null>;
  };
  export const agentCapabilityEvidence: {
    discover(): Promise<import("./runUserGoal/recoverAgentCapability/contract.js").ActionAssignment>;
    inspect(id: string): Promise<import("./runUserGoal/recoverAgentCapability/contract.js").ActionEvidence>;
  };
  export const agentCapabilityContinue: {
    apply(id: string, resultDigest: string, revision: string,
      decision: import("./runUserGoal/recoverAgentCapability/contract.js").CapabilityDecision):
      Promise<import("./runUserGoal/recoverAgentCapability/contract.js").Continuation | null>;
  };
  export const goalDiscovery: {
    search(queries: string[]): Promise<import("./types.js").GoalSearchResult[]>;
    snapshotTime(): number;
  };
  export const goalWorkspace: {
    list(): Promise<string[]>;
    read(path: string): Promise<import("./types.js").WorkspaceRevision | null>;
    revise(path: string, version: string, text: string): Promise<import("./types.js").WorkspaceWrite>;
  };
  export const goalBrowser: {
    inspect(): Promise<import("./types.js").BrowserView>;
    activate(control: string, revision: string): Promise<"activated" | "changed" | "unavailable">;
  };
  export const goalSuite: {
    discover(): Promise<import("./types.js").OpenSuiteRoute[]>;
    prepare(choice: import("./types.js").OpenSuiteChoice): Promise<import("./types.js").OpenSuiteRequest | null>;
  };
  export const pdfVaultBridge: {
    bind(pdf: unknown, citationIndices: number[]): Promise<import("./types.js").PdfVaultHandoff>;
  };
}

declare module "natlang:services" {
  export const notificationState: {
    discover(): Promise<import("./types.js").NotificationLane[]>;
    read(lane: import("./types.js").NotificationLane): Promise<import("./types.js").NotificationSnapshot | null>;
    refresh(lane: import("./types.js").NotificationLane): Promise<import("./types.js").NotificationRefresh>;
    acknowledge(lane: import("./types.js").NotificationLane, id: string, revision: number):
      Promise<import("./types.js").NotificationAcknowledgment>;
  };
}

declare module "natlang:services" {
  export const desktopReadiness: {
    discover(): Promise<import("./types.js").DesktopDesk[]>;
    readWindow(id: string): Promise<import("./types.js").DesktopWindowObservation>;
    readUpdates(id: string): Promise<import("./types.js").DesktopUpdateObservation>;
  };
}

declare module "natlang:services" {
  export const skillMaintenanceEvidence: {
    discover(): Promise<import("./types.js").SkillMaintenanceCard[]>;
    inspect(id: string): Promise<import("./types.js").SkillMaintenanceObservation>;
    confirm(id: string, revision: string): Promise<import("./types.js").SkillMaintenanceGate>;
    readback(id: string): Promise<import("./types.js").SkillMaintenanceCheck>;
  };
  export const skillMaintenanceEdit: {
    stage(id: string, revision: string, changes: import("./types.js").SkillMaintenanceChange[]):
      Promise<import("./types.js").SkillMaintenanceReceipt>;
  };
}
