declare module "natlang:services" {
  export const automationActivationEvidence: {
    observe(): Promise<import("./activateOwnedAutomation/types.js").AutomationLaunchEvidence>;
  };
  export const automationActivationCommit: {
    activate(revision: string, plan: import("./activateOwnedAutomation/types.js").LaunchPlan,
      decision: import("./activateOwnedAutomation/types.js").AutomationLaunchChoice):
      Promise<import("./activateOwnedAutomation/types.js").AutomationActivation>;
  };
  export const automationActivationReadback: {
    read(receipt: import("./activateOwnedAutomation/types.js").AutomationLaunchReceipt):
      Promise<import("./activateOwnedAutomation/types.js").AutomationLaunchReadback>;
  };
}

declare module "natlang:services" {
  export const boardMigration: {
    listSources(): Promise<import("./reviewBoardMigration/types.js").LegacyBoard[]>;
    inspect(id: string): Promise<import("./reviewBoardMigration/types.js").MigrationView>;
    readTarget(): Promise<import("./reviewBoardMigration/types.js").MigrationBasis>;
    retain(boardId: string, revision: string, selection: import("./reviewBoardMigration/types.js").MigrationSelection): Promise<import("./reviewBoardMigration/types.js").BoardMigrationReceipt | null>;
  };
}
declare module "natlang:services" {
  export const contentProjectSources: {
    observe(): Promise<import("./prepareContentProject/types.js").ProjectEvidenceReview>;
  };
  export const contentProjectScope: {
    confirm(revision: string, decision: import("./prepareContentProject/types.js").ProjectEvidenceDecision):
      Promise<import("./prepareContentProject/types.js").ProjectScopeLease>;
  };
  export const contentProjectDraft: {
    observe(receipt: string | null): Promise<import("./prepareContentProject/types.js").PreparedContentSnapshot | null>;
    prepare(receipt: string | null, head: string): Promise<import("./prepareContentProject/types.js").PreparedContentSnapshot | null>;
    write(receipt: string | null, head: string, documents: {path: string; text: string}[]):
      Promise<import("./prepareContentProject/types.js").PreparedContentSnapshot | null>;
  };
  export const contentProjectCommit: {
    commit(receipt: string | null, head: string, message: string): Promise<{eventId:string;head:string} | null>;
  };
}

declare module "natlang:services" {
  export const localInventoryDocket: {
    list(): Promise<import("./compareLiveLocalInventory/types.js").LocalInventoryCard[]>;
    read(id: string): Promise<import("./compareLiveLocalInventory/types.js").LocalInventoryDocket>;
  };
  export const androidGoalAudit: {
    readScope(goal: string): Promise<import("./auditAndroidGoal/types.js").AndroidGoalAuditScope>;
  };
  export const androidDeliveryScope: {
    read(goal: string): Promise<import("./verifyAndroidDelivery/types.js").AndroidDeliveryScope>;
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
    list(): Promise<import("./workOnLiveTendrilBoard/types.js").LiveTendrilCard[]>;
    read(id: string): Promise<import("./workOnLiveTendrilBoard/types.js").LiveTendrilTicket>;
  };
}

declare module "natlang:services" {
  export const cliRouteDocket: {
    list(): Promise<import("./recoverCliRoute/types.js").CliDocket[]>;
    read(id: string, revision: string): Promise<import("./recoverCliRoute/types.js").CliDocketEvidence>;
  };
}

declare module "natlang:services" {
  export const operationsDocket: {
    list(): Promise<import("./coordinateOwnedOperations/types.js").OperationsDocket[]>;
    read(id: string, revision: string): Promise<import("./coordinateOwnedOperations/types.js").OperationsDocketEvidence>;
  };
  export const operationsDossier: {
    retain(id: string, revision: string, report: import("./coordinateOwnedOperations/roles/types.js").OperationsReport):
      Promise<import("./coordinateOwnedOperations/types.js").OperationsDossier>;
  };
  export const ownedOperations: import("./coordinateOwnedOperations/roles/types.js").OwnedOperations;
}

declare module "natlang:services" {
  export const problemIncident: {
    discover(): Promise<import("./workOnProblemReportGoal/types.js").IncidentCard[]>;
    open(incident: string): Promise<{ operationId: string } | null>;
  };
}
declare module "natlang:services" {
  export const recoveryHandoffLink: {
    discover(): Promise<import("./workOnRecoveryHandoff/contract.js").RecoveryHandoffDirective>;
    prepare(jobId: string, runId: string, runDigest: string, resultDigest: string, digest: string,
      directive: import("./workOnRecoveryHandoff/contract.js").RecoveryHandoffDirective
    ): Promise<import("./workOnRecoveryHandoff/contract.js").RecoveryHandoffInput>;
  };
  export const buildIncidentCatalog: {
    discover(): Promise<import("./reviewRetainedBuildIncident/contract.js").IncidentSurvey>;
    open(id: string): Promise<import("./reviewRetainedBuildIncident/contract.js").RetainedProfile>;
  };
  export const buildIncidentHandoff: {
    stage(checkpoints: string[], focus: import("./reviewRetainedBuildIncident/contract.js").IncidentFocus):
      Promise<import("./reviewRetainedBuildIncident/contract.js").IncidentReceipt | null>;
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
    discover(): Promise<import("./reviewLocalExecutionWidth/contract.js").WidthSurvey>;
    readWitness(id: string): Promise<import("./reviewLocalExecutionWidth/contract.js").WidthReceipt>;
  };
  export const localWidthHandoff: {
    stage(finding: import("./reviewLocalExecutionWidth/contract.js").WidthFinding):
      Promise<import("./reviewLocalExecutionWidth/contract.js").WidthHandoff | null>;
  };
  export const interfaceEvidence: {
    discover(): Promise<import("./reviewDeployedInterface/contract.js").InterfaceSurvey>;
    inspect(id: string): Promise<import("./reviewDeployedInterface/contract.js").InterfaceObservation>;
  };
  export const interfaceReviewHandoff: {
    stage(observation: import("./reviewDeployedInterface/contract.js").InterfaceObservation,
      decision: import("./reviewDeployedInterface/contract.js").InterfaceDecision):
      Promise<import("./reviewDeployedInterface/contract.js").InterfaceHandoff | null>;
  };
  export const extensionDossierRead: {
    discover(): Promise<import("./reviewExtensionDossier/contract.js").DossierAssignment>;
    candidate(operationId: string): Promise<import("./reviewExtensionDossier/contract.js").ManifestDelta>;
    history(operationId: string): Promise<import("./reviewExtensionDossier/contract.js").ReleaseHistory>;
  };
  export const extensionDossierWrite: {
    stage(decision: import("./reviewExtensionDossier/contract.js").DossierDecision):
      Promise<import("./reviewExtensionDossier/contract.js").DossierReceipt | null>;
  };
  export const installedPackageRead: {
    discover(): Promise<import("./reviewInstalledPackage/contract.js").PackageAssignment>;
    inspect(operationId: string): Promise<import("./reviewInstalledPackage/contract.js").PackageObservation>;
  };
  export const installedPackageChange: {
    restore(operationId: string, workingRevision: string, workingDigest: string):
      Promise<import("./reviewInstalledPackage/contract.js").PackageRestore>;
  };
  export const webhookAdmissionEvidence: {
    discover(): Promise<import("./reviewWebhookAdmission/contract.js").WebhookAdmissionAssignment>;
    inspect(id: string): Promise<import("./reviewWebhookAdmission/contract.js").WebhookAdmissionEvidence>;
  };
  export const webhookAdmissionHandoff: {
    stage(id: string, digest: string | null, row: import("./reviewWebhookAdmission/contract.js").WebhookAdmissionRow | null,
      disposition: import("./reviewWebhookAdmission/contract.js").WebhookAdmissionDecision):
      Promise<import("./reviewWebhookAdmission/contract.js").WebhookAdmissionReceipt>;
  };
  export const transcriptApproval: {
    discover(): Promise<import("./reviewTranscriptSurface/contract.js").SurfaceAssignment>;
    list(id: string): Promise<import("./reviewTranscriptSurface/contract.js").SurfaceApproval[]>;
  };
  export const transcriptObservation: {
    replay(id: string, approval: string): Promise<import("./reviewTranscriptSurface/contract.js").SurfaceReplay>;
  };
  export const transcriptMutation: {
    apply(id: string, approval: string, cursor: number, effect: import("./reviewTranscriptSurface/contract.js").SurfaceEffect):
      Promise<import("./reviewTranscriptSurface/contract.js").SurfaceReceipt>;
  };
  export const illustrationEvidence: {
    discover(): Promise<import("./generateOwnedIllustration/contract.js").IllustrationAssignment>;
    read(scope: string): Promise<import("./generateOwnedIllustration/contract.js").IllustrationBasis>;
  };
  export const illustrationJobs: {
    run(scope: string, head: string, action: import("./generateOwnedIllustration/contract.js").IllustrationDecision["action"]):
      Promise<import("./generateOwnedIllustration/contract.js").IllustrationOutcome>;
  };
  export const illustrationOriginal: {
    save(scope: string, head: string, job: string, digest: string): Promise<import("./generateOwnedIllustration/contract.js").IllustrationSave>;
  };
  export const recordedQuestionDiscovery: {
    discover(): Promise<import("./reviewRecordedQuestion/contract.js").RecordedQuestion>;
    search(id: string, phrase: string): Promise<import("./reviewRecordedQuestion/contract.js").RecordedCandidate[]>;
  };
  export const recordedQuestionGraph: {
    cohort(id: string, ref: string): Promise<import("./reviewRecordedQuestion/contract.js").RecordedCohort>;
    rejections(id: string, ref: string, cohort: import("./reviewRecordedQuestion/contract.js").RecordedCohort):
      Promise<import("./reviewRecordedQuestion/contract.js").RecordedCounteraction[]>;
  };
  export const sourceOriginEvidence: {
    discover(): Promise<import("./reviewSourceAttribution/contract.js").SourceAttributionAssignment>;
    read(id: string, candidate: string): Promise<import("./reviewSourceAttribution/contract.js").SourceAttributionFile | null>;
  };
  export const sourceOriginGraph: {
    trace(id: string, state: string, candidate: string, fragment: string): Promise<import("./reviewSourceAttribution/contract.js").SourceAttributionTrace>;
    inspect(id: string, ref: string): Promise<import("./reviewSourceAttribution/contract.js").SourceAttributionRoot>;
  };
  export const sourceOriginReceipt: {
    retain(id: string, state: string, conclusion: import("./reviewSourceAttribution/contract.js").SourceAttributionConclusion):
      Promise<import("./reviewSourceAttribution/contract.js").SourceAttributionReceipt>;
  };
  export const workspaceSmokeEvidence: {
    discover(): Promise<import("./reviewWorkspaceSmoke/contract.js").SmokeAssignment>;
    scan(id: string): Promise<import("./reviewWorkspaceSmoke/contract.js").SmokeSource>;
  };
  export const workspaceSmokeRuntime: {
    run(id: string, path: string, digest: string): Promise<import("./reviewWorkspaceSmoke/contract.js").SmokeRuntime>;
  };
  export const workspaceSmokeHandoff: {
    stage(id: string, path: string, runDigest: string): Promise<import("./reviewWorkspaceSmoke/contract.js").SmokeReceipt>;
  };
  export const sameTurnEvalEvidence: {
    discover(): Promise<import("./recoverSameTurnEval/contract.js").EvalAssignment>;
    observe(id: string): Promise<import("./recoverSameTurnEval/contract.js").EvalCellEvidence>;
  };
  export const sameTurnEvalRecovery: {
    resolve(id: string, runId: string, decision: import("./recoverSameTurnEval/contract.js").EvalPick["decision"]):
      Promise<import("./recoverSameTurnEval/contract.js").EvalRecoveryReceipt>;
  };
  export const deliveryWakeEvidence: {
    discover(): Promise<import("./reviewDeliveryWake/contract.js").DeliveryWakeAssignment>;
    observe(id: string): Promise<import("./reviewDeliveryWake/contract.js").DeliveryWakeEvidence>;
  };
  export const deliveryWakeAction: {
    apply(id: string, event: string, cursor: import("./reviewDeliveryWake/contract.js").DeliveryBound | null):
      Promise<import("./reviewDeliveryWake/contract.js").DeliveryWakeReceipt>;
  };
  export const logFollowerEvidence: {
    discover(): Promise<import("./reviewLogFollower/contract.js").FollowAssignment>;
    observe(id: string): Promise<import("./reviewLogFollower/contract.js").FollowCapture>;
  };
  export const logFollowerHandoff: {
    stage(id: string, joined: import("./reviewLogFollower/contract.js").FollowJoin,
      decision: import("./reviewLogFollower/contract.js").FollowDecision):
      Promise<import("./reviewLogFollower/contract.js").FollowReceipt>;
  };
  export const ptyContinuityEvidence: {
    discover(): Promise<import("./reviewPtyContinuity/contract.js").PtyAssignment>;
    inspect(sessionId: string): Promise<import("./reviewPtyContinuity/contract.js").PtyObservation | null>;
  };
  export const ptyContinuityHandoff: {
    stage(sessionId: string, digest: string, disposition: import("./reviewPtyContinuity/contract.js").PtyDisposition):
      Promise<import("./reviewPtyContinuity/contract.js").PtyReceipt>;
  };
  export const developmentAuditEvidence: {
    discover(): Promise<import("./reviewDevelopmentAudit/contract.js").DevelopmentAssignment>;
    read(id: string): Promise<import("./reviewDevelopmentAudit/contract.js").DevelopmentObservation | null>;
  };
  export const developmentAuditKeep: {
    keep(id: string, snapshot: string, updatedAt: number): Promise<import("./reviewDevelopmentAudit/contract.js").DevelopmentKeepReceipt>;
  };
  export const contentArchiveEvidence: {
    discover(): Promise<import("./recoverContentArchive/contract.js").ContentArchiveAssignment>;
    inspect(id: string): Promise<import("./recoverContentArchive/contract.js").ContentArchiveObservation>;
  };
  export const contentArchiveChange: {
    restore(id: string, ref: string | null, head: string, paths: string[]):
      Promise<import("./recoverContentArchive/contract.js").ContentArchiveReceipt>;
  };
  export const systemReleaseEvidence: {
    discover(): Promise<import("./reviewSystemRelease/contract.js").ReleaseAssignment>;
    compare(id: string): Promise<import("./reviewSystemRelease/contract.js").RetainedRunPair>;
    inspectCase(id: string, runId: string | null, name: string): Promise<import("./reviewSystemRelease/contract.js").CaseEvidence>;
  };
  export const systemReleaseHandoff: {
    stage(id: string, runId: string | null, disposition: import("./reviewSystemRelease/contract.js").ReleaseAssessment["disposition"],
      cases: import("./reviewSystemRelease/contract.js").CaseEvidence[]):
      Promise<import("./reviewSystemRelease/contract.js").ReleaseReceipt | null>;
  };
  export const panelMigrationEvidence: {
    discover(): Promise<import("./migratePanelSource/contract.js").PanelMigrationAssignment>;
    inspect(id: string): Promise<import("./migratePanelSource/contract.js").MigrationObservation>;
  };
  export const panelMigrationChange: {
    move(id: string, head: string): Promise<import("./migratePanelSource/contract.js").MigrationReceipt>;
    align(id: string, head: string, manifestDigest: string): Promise<import("./migratePanelSource/contract.js").MigrationReceipt>;
    update(id: string, head: string, guideDigest: string): Promise<import("./migratePanelSource/contract.js").MigrationReceipt>;
  };
  export const workspaceShareEvidence: {
    discover(): Promise<import("./reviewWorkspaceShare/contract.js").ShareAssignment>;
    inspect(id: string): Promise<import("./reviewWorkspaceShare/contract.js").ShareObservation>;
  };
  export const workspaceShareHandoff: {
    stage(observation: import("./reviewWorkspaceShare/contract.js").ShareObservation,
      decision: import("./reviewWorkspaceShare/contract.js").ShareDecision):
      Promise<import("./reviewWorkspaceShare/contract.js").ShareReceipt | null>;
  };
  export const agentCapabilityEvidence: {
    discover(): Promise<import("./recoverAgentCapability/contract.js").ActionAssignment>;
    inspect(id: string): Promise<import("./recoverAgentCapability/contract.js").ActionEvidence>;
    readRetainedValues(id: string, resultDigest: string, revision: string):
      Promise<import("./recoverAgentCapability/contract.js").RetainedNotebookValue[] | null>;
  };
  export const agentCapabilityContinue: {
    apply(id: string, resultDigest: string, revision: string,
      decision: import("./recoverAgentCapability/contract.js").CapabilityDecision):
      Promise<import("./recoverAgentCapability/contract.js").Continuation | null>;
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
    nominate(goal: string): Promise<import("./compareTestkitCloseouts/types.js").CloseoutPair>;
    stage(decision: import("./compareTestkitCloseouts/types.js").CloseoutDecision):
      Promise<import("./compareTestkitCloseouts/types.js").CloseoutReceipt>;
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
    discover(): Promise<import("./reviewUnitHandoffGoal/contract.js").UnitHandoffUnit[]>;
    begin(path: string): Promise<import("./reviewUnitHandoffGoal/contract.js").UnitHandoffObservation>;
    lifecycle(path: string): Promise<import("./reviewUnitHandoffGoal/contract.js").UnitLifecycleObservation>;
  };
}

declare module "natlang:services" {
  export const googleRunbook: {
    read(): Promise<import("./reconcileGoogleRunbook/contract.js").RunbookBasis>;
    apply(calendar: unknown, proposal: import("./reconcileGoogleRunbook/contract.js").RunbookDocument):
      Promise<import("./reconcileGoogleRunbook/contract.js").RunbookWrite>;
  };
  export const newsEditionReview: {
    readDesk(): Promise<import("./prepareNewsEditionReview/contract.js").EditorDesk>;
    stage(desk: import("./prepareNewsEditionReview/contract.js").EditorDesk,
      plan: import("./prepareNewsEditionReview/contract.js").EditorPacketPlan, news: unknown, presentation: unknown):
      Promise<import("./prepareNewsEditionReview/contract.js").EditorPacketReceipt | null>;
  };
}

declare module "natlang:services" {
  export const publicBrief: {
    bind(sources: string[]): Promise<import("./answerFromAssignedPublicSources/contract.js").AssignedPublicRequest | null>;
  };
}
