declare module "natlang:services" {
  export const boardMigration: {
    listSources(): Promise<import("./runUserGoal/reviewBoardMigration/types.js").LegacyBoard[]>;
    inspect(id: string): Promise<import("./runUserGoal/reviewBoardMigration/types.js").MigrationView>;
    readTarget(): Promise<import("./runUserGoal/reviewBoardMigration/types.js").MigrationBasis>;
    retain(boardId: string, revision: string, selection: import("./runUserGoal/reviewBoardMigration/types.js").MigrationSelection): Promise<import("./runUserGoal/reviewBoardMigration/types.js").BoardMigrationReceipt | null>;
  };
}
declare module "natlang:services" {
  export const contentProjectSources: {
    observe(): Promise<import("./runUserGoal/prepareContentProject/types.js").ProjectEvidenceReview>;
  };
  export const contentProjectScope: {
    confirm(revision: string, decision: import("./runUserGoal/prepareContentProject/types.js").ProjectEvidenceDecision):
      Promise<import("./runUserGoal/prepareContentProject/types.js").ProjectScopeLease>;
  };
  export const contentProjectDraft: {
    prepare(receipt: string | null, head: string): Promise<import("./runUserGoal/prepareContentProject/types.js").PreparedContentSnapshot | null>;
    write(receipt: string | null, head: string, documents: {path: string; text: string}[]):
      Promise<import("./runUserGoal/prepareContentProject/types.js").PreparedContentSnapshot | null>;
  };
  export const contentProjectCommit: {
    commit(receipt: string | null, head: string, message: string): Promise<{eventId:string;head:string} | null>;
  };
}

declare module "natlang:services" {
  export const localInventoryDocket: {
    list(): Promise<import("./runUserGoal/compareLiveLocalInventory/types.js").LocalInventoryCard[]>;
    read(id: string): Promise<import("./runUserGoal/compareLiveLocalInventory/types.js").LocalInventoryDocket>;
  };
  export const androidGoalAudit: {
    readScope(goal: string): Promise<import("./runUserGoal/auditAndroidGoal/types.js").AndroidGoalAuditScope>;
  };
  export const androidDeliveryScope: {
    read(goal: string): Promise<import("./runUserGoal/verifyAndroidDelivery/types.js").AndroidDeliveryScope>;
  };
}

declare module "natlang:services" {
  export const terminalRepairCatalog: {
    list(): Promise<import("./types.js").TerminalRepairApp[]>;
  };
  export const terminalRepairObserve: {
    read(appId: string): Promise<import("./types.js").TerminalRepairCheck>;
  };
  export const terminalRepairApply: {
    edit(appId: string, revision: string, edits: import("./types.js").TerminalRepairEdit[]): Promise<import("./types.js").TerminalRepairApplied>;
  };
  export const terminalRepairFinal: {
    verify(appId: string, revision: string): Promise<import("./types.js").TerminalRepairCheck>;
  };
  export const terminalRepairArtifact: {
    read(appId: string, revision: string): Promise<import("./types.js").TerminalRepairArtifact | null>;
  };

  export const tendrilBoardDocket: {
    list(): Promise<import("./runUserGoal/workOnLiveTendrilBoard/types.js").LiveTendrilCard[]>;
    read(id: string): Promise<import("./runUserGoal/workOnLiveTendrilBoard/types.js").LiveTendrilTicket>;
  };
}

declare module "natlang:services" {
  export const cliRouteDocket: {
    list(): Promise<import("./runUserGoal/recoverCliRoute/types.js").CliDocket[]>;
    read(id: string, revision: string): Promise<import("./runUserGoal/recoverCliRoute/types.js").CliDocketEvidence>;
  };
}

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
  export const transcriptApproval: {
    discover(): Promise<import("./runUserGoal/reviewTranscriptSurface/contract.js").SurfaceAssignment>;
    list(id: string): Promise<import("./runUserGoal/reviewTranscriptSurface/contract.js").SurfaceApproval[]>;
  };
  export const transcriptObservation: {
    replay(id: string, approval: string): Promise<import("./runUserGoal/reviewTranscriptSurface/contract.js").SurfaceReplay>;
  };
  export const transcriptMutation: {
    apply(id: string, approval: string, cursor: number, effect: import("./runUserGoal/reviewTranscriptSurface/contract.js").SurfaceEffect):
      Promise<import("./runUserGoal/reviewTranscriptSurface/contract.js").SurfaceReceipt>;
  };
  export const illustrationEvidence: {
    discover(): Promise<import("./runUserGoal/generateOwnedIllustration/contract.js").IllustrationAssignment>;
    read(scope: string): Promise<import("./runUserGoal/generateOwnedIllustration/contract.js").IllustrationBasis>;
  };
  export const illustrationJobs: {
    run(scope: string, head: string, action: import("./runUserGoal/generateOwnedIllustration/contract.js").IllustrationDecision["action"]):
      Promise<import("./runUserGoal/generateOwnedIllustration/contract.js").IllustrationOutcome>;
  };
  export const illustrationOriginal: {
    save(scope: string, head: string, job: string, digest: string): Promise<import("./runUserGoal/generateOwnedIllustration/contract.js").IllustrationSave>;
  };
  export const recordedQuestionDiscovery: {
    discover(): Promise<import("./runUserGoal/reviewSourceAttribution/reviewRecordedQuestion/contract.js").RecordedQuestion>;
    search(id: string, phrase: string): Promise<import("./runUserGoal/reviewSourceAttribution/reviewRecordedQuestion/contract.js").RecordedCandidate[]>;
  };
  export const recordedQuestionGraph: {
    cohort(id: string, ref: string): Promise<import("./runUserGoal/reviewSourceAttribution/reviewRecordedQuestion/contract.js").RecordedCohort>;
    rejections(id: string, ref: string, cohort: import("./runUserGoal/reviewSourceAttribution/reviewRecordedQuestion/contract.js").RecordedCohort):
      Promise<import("./runUserGoal/reviewSourceAttribution/reviewRecordedQuestion/contract.js").RecordedCounteraction[]>;
  };
  export const sourceOriginEvidence: {
    discover(): Promise<import("./runUserGoal/reviewSourceAttribution/contract.js").SourceAttributionAssignment>;
    read(id: string, candidate: string): Promise<import("./runUserGoal/reviewSourceAttribution/contract.js").SourceAttributionFile | null>;
  };
  export const sourceOriginGraph: {
    trace(id: string, state: string, candidate: string, fragment: string): Promise<import("./runUserGoal/reviewSourceAttribution/contract.js").SourceAttributionTrace>;
    inspect(id: string, ref: string): Promise<import("./runUserGoal/reviewSourceAttribution/contract.js").SourceAttributionRoot>;
  };
  export const sourceOriginReceipt: {
    retain(id: string, state: string, conclusion: import("./runUserGoal/reviewSourceAttribution/contract.js").SourceAttributionConclusion):
      Promise<import("./runUserGoal/reviewSourceAttribution/contract.js").SourceAttributionReceipt>;
  };
  export const workspaceSmokeEvidence: {
    discover(): Promise<import("./runUserGoal/reviewWorkspaceSmoke/contract.js").SmokeAssignment>;
    scan(id: string): Promise<import("./runUserGoal/reviewWorkspaceSmoke/contract.js").SmokeSource>;
  };
  export const workspaceSmokeRuntime: {
    run(id: string, path: string, digest: string): Promise<import("./runUserGoal/reviewWorkspaceSmoke/contract.js").SmokeRuntime>;
  };
  export const workspaceSmokeHandoff: {
    stage(id: string, path: string, runDigest: string): Promise<import("./runUserGoal/reviewWorkspaceSmoke/contract.js").SmokeReceipt>;
  };
  export const sameTurnEvalEvidence: {
    discover(): Promise<import("./runUserGoal/recoverSameTurnEval/contract.js").EvalAssignment>;
    observe(id: string): Promise<import("./runUserGoal/recoverSameTurnEval/contract.js").EvalCellEvidence>;
  };
  export const sameTurnEvalRecovery: {
    resolve(id: string, runId: string, decision: import("./runUserGoal/recoverSameTurnEval/contract.js").EvalPick["decision"]):
      Promise<import("./runUserGoal/recoverSameTurnEval/contract.js").EvalRecoveryReceipt>;
  };
  export const deliveryWakeEvidence: {
    discover(): Promise<import("./runUserGoal/reviewDeliveryWake/contract.js").DeliveryWakeAssignment>;
    observe(id: string): Promise<import("./runUserGoal/reviewDeliveryWake/contract.js").DeliveryWakeEvidence>;
  };
  export const deliveryWakeAction: {
    apply(id: string, event: string, cursor: import("./runUserGoal/reviewDeliveryWake/contract.js").DeliveryBound | null):
      Promise<import("./runUserGoal/reviewDeliveryWake/contract.js").DeliveryWakeReceipt>;
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

declare module "natlang:services" {
  export const unitHandoff: {
    discover(): Promise<import("./runUserGoal/reviewUnitHandoffGoal/contract.js").UnitHandoffUnit[]>;
    begin(path: string): Promise<import("./runUserGoal/reviewUnitHandoffGoal/contract.js").UnitHandoffObservation>;
    lifecycle(path: string): Promise<import("./runUserGoal/reviewUnitHandoffGoal/contract.js").UnitLifecycleObservation>;
  };
}
