declare module "natlang:services" {
  export const operationsDocket: {
    list(): Promise<import("./runUserGoal/coordinateOwnedOperations/types.js").OperationsDocket[]>;
    read(id: string, revision: string): Promise<import("./runUserGoal/coordinateOwnedOperations/types.js").OperationsDocketEvidence>;
  };
  export const operationsDossier: {
    retain(id: string, revision: string, report: import("./runUserGoal/coordinateOwnedOperations/roles/types.js").OperationsReport):
      Promise<import("./runUserGoal/coordinateOwnedOperations/types.js").OperationsDossier>;
  };
  export const ownedOperations: import("./runUserGoal/coordinateOwnedOperations/roles/types.js").OwnedOperations;
}

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
  export const webhookAdmissionEvidence: {
    discover(): Promise<import("./runUserGoal/reviewWebhookAdmission/contract.js").WebhookAdmissionAssignment>;
    inspect(id: string): Promise<import("./runUserGoal/reviewWebhookAdmission/contract.js").WebhookAdmissionEvidence>;
  };
  export const webhookAdmissionHandoff: {
    stage(id: string, digest: string | null, row: import("./runUserGoal/reviewWebhookAdmission/contract.js").WebhookAdmissionRow | null,
      disposition: import("./runUserGoal/reviewWebhookAdmission/contract.js").WebhookAdmissionDecision):
      Promise<import("./runUserGoal/reviewWebhookAdmission/contract.js").WebhookAdmissionReceipt>;
  };
  export const logFollowerEvidence: {
    discover(): Promise<import("./runUserGoal/reviewLogFollower/contract.js").FollowAssignment>;
    observe(id: string): Promise<import("./runUserGoal/reviewLogFollower/contract.js").FollowCapture>;
  };
  export const logFollowerHandoff: {
    stage(id: string, joined: import("./runUserGoal/reviewLogFollower/contract.js").FollowJoin,
      decision: import("./runUserGoal/reviewLogFollower/contract.js").FollowDecision):
      Promise<import("./runUserGoal/reviewLogFollower/contract.js").FollowReceipt>;
  };
  export const ptyContinuityEvidence: {
    discover(): Promise<import("./runUserGoal/reviewPtyContinuity/contract.js").PtyAssignment>;
    inspect(sessionId: string): Promise<import("./runUserGoal/reviewPtyContinuity/contract.js").PtyObservation | null>;
  };
  export const ptyContinuityHandoff: {
    stage(sessionId: string, digest: string, disposition: import("./runUserGoal/reviewPtyContinuity/contract.js").PtyDisposition):
      Promise<import("./runUserGoal/reviewPtyContinuity/contract.js").PtyReceipt>;
  };
  export const developmentAuditEvidence: {
    discover(): Promise<import("./runUserGoal/reviewDevelopmentAudit/contract.js").DevelopmentAssignment>;
    read(id: string): Promise<import("./runUserGoal/reviewDevelopmentAudit/contract.js").DevelopmentObservation | null>;
  };
  export const developmentAuditKeep: {
    keep(id: string, snapshot: string, updatedAt: number): Promise<import("./runUserGoal/reviewDevelopmentAudit/contract.js").DevelopmentKeepReceipt>;
  };
  export const contentArchiveEvidence: {
    discover(): Promise<import("./runUserGoal/recoverContentArchive/contract.js").ContentArchiveAssignment>;
    inspect(id: string): Promise<import("./runUserGoal/recoverContentArchive/contract.js").ContentArchiveObservation>;
  };
  export const contentArchiveChange: {
    restore(id: string, ref: string | null, head: string, paths: string[]):
      Promise<import("./runUserGoal/recoverContentArchive/contract.js").ContentArchiveReceipt>;
  };
  export const systemReleaseEvidence: {
    discover(): Promise<import("./runUserGoal/reviewSystemRelease/contract.js").ReleaseAssignment>;
    compare(id: string): Promise<import("./runUserGoal/reviewSystemRelease/contract.js").RetainedRunPair>;
    inspectCase(id: string, runId: string | null, name: string): Promise<import("./runUserGoal/reviewSystemRelease/contract.js").CaseEvidence>;
  };
  export const systemReleaseHandoff: {
    stage(id: string, runId: string | null, disposition: import("./runUserGoal/reviewSystemRelease/contract.js").ReleaseAssessment["disposition"],
      cases: import("./runUserGoal/reviewSystemRelease/contract.js").CaseEvidence[]):
      Promise<import("./runUserGoal/reviewSystemRelease/contract.js").ReleaseReceipt | null>;
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

declare module "natlang:services" {
  export const testkitCloseout: {
    nominate(goal: string): Promise<import("./runUserGoal/compareTestkitCloseouts/types.js").CloseoutPair>;
    stage(report: import("./runUserGoal/compareTestkitCloseouts/types.js").CloseoutReport):
      Promise<import("./runUserGoal/compareTestkitCloseouts/types.js").CloseoutReceipt>;
  };
  export const phoneFirstRun: {
    discover(): Promise<import("./types.js").PhoneFirstRunCard[]>;
    inspect(id: string): Promise<import("./types.js").PhoneFirstRunAssignment>;
    phases(id: string): Promise<import("./types.js").PhonePhaseEvidence>;
    provider(id: string): Promise<import("./types.js").PhoneProviderEvidence>;
  };
}

declare module "natlang:services" {
  export const grimoireScene: {
    discover(): Promise<import("./types.js").GrimoireDocket[]>;
    view(id: string): Promise<import("./types.js").GrimoireSceneView>;
    readScope(id: string): Promise<import("./types.js").GrimoireCaretakerScope>;
    confirm(id: string, frontier: string): Promise<import("./types.js").GrimoireSceneGate>;
    readback(id: string, path: string | null): Promise<import("./types.js").GrimoireSceneReadback>;
  };
  export const grimoireHandoff: {
    stage(id: string, frontier: string, plan: import("./types.js").GrimoirePlan): Promise<import("./types.js").GrimoireSceneReceipt | null>;
  };
}

declare module "natlang:services" {
  export const adoptionReview: {
    discover(): Promise<import("./types.js").AdoptionReviewCard[]>;
    installed(id: string): Promise<import("./types.js").AdoptionInstalled>;
    compose(id: string, event: string): Promise<import("./types.js").AdoptionComposition>;
    confirm(id: string, event: string): Promise<import("./types.js").AdoptionGate>;
    readback(id: string, path: string | null): Promise<import("./types.js").AdoptionReadback>;
  };
  export const adoptionHandoff: {
    record(id: string, event: string, plan: import("./types.js").AdoptionPlan): Promise<import("./types.js").AdoptionReceipt | null>;
  };
}

declare module "natlang:services" {
  export const systemCandidateRead: {
    discover(): Promise<import("./types.js").SystemCandidateCard[]>;
    compare(id: string, event: string): Promise<import("./types.js").SystemCandidateFrontier>;
    preview(id: string, event: string, coordinate: string): Promise<import("./types.js").SystemCandidatePreview>;
    confirm(id: string, event: string, coordinate: string): Promise<import("./types.js").SystemCandidateGate>;
    readback(id: string, path: string | null): Promise<import("./types.js").SystemCandidateReadback>;
  };
  export const systemCandidateHandoff: {
    record(id: string, event: string, coordinate: string, plan: import("./types.js").SystemCandidatePlan):
      Promise<import("./types.js").SystemCandidateReceipt | null>;
  };
}

declare module "natlang:services" {
  export const scaffoldRead: {
    discover(): Promise<import("./types.js").ScaffoldCard[]>;
    options(id: string): Promise<import("./types.js").ScaffoldOptions>;
    readback(id: string, draft: string | null): Promise<import("./types.js").ScaffoldReadback>;
  };
  export const scaffoldPrepare: {
    prepare(id: string, event: string, kinds: import("./types.js").ScaffoldKind[]): Promise<import("./types.js").ScaffoldReceipt | null>;
  };
  export const localMethodRead: {
    discover(): Promise<import("./types.js").LocalMethodCard[]>;
    inspect(id: string): Promise<import("./types.js").LocalMethodEvidence>;
    settle(id: string, basis: string, transport: string | null): Promise<import("./types.js").LocalMethodReport | null>;
  };
  export const localMethodDispatch: {
    request(id: string, basis: string, method: import("./types.js").LocalMethodKind): Promise<import("./types.js").LocalMethodAttempt>;
  };
}
