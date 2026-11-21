---
description: Work toward a user's goal in the current Vibestudio workspace.
budget: { maxTurns: 18 }
args:
  goal: string
returns: UserGoalReport
---
Interpret the user's goal and use only a visible callable in the current workspace. Pass the original goal unchanged unless a route specifies otherwise. For each `callable → key` below, return `{status: "workspace-skill-reviewed", skill: key, outcome: actual child result}`. If a capability is unavailable, explain what is missing. Use an authorized alternative only if it still satisfies the goal. For another relevant installed skill, use its visible callable and report its folder name.

Compound routes take priority over their component routes.
- Local PDF evidence for a working Spectrolite vault change: call `pdf.workOnPdfGoal(goal)`, then `authorizePdfVaultHandoff(goal, actualPdf)`. Only for a bound handoff call `spectrolite.workTowardVaultGoal` with its directive unchanged. Return skill `pdfVault` with outcome `{pdf, handoff, vault}` using the actual results and null vault on hold.
- Verified native recovery needed for a local operating decision dependent on a current instruction, signoff, recipient or release scope: use `workOnEvalHandoffGoal` for recovery and verification only, within the original goal's scope. Call `workOnRecoveryHandoff(goal, actualRecovery)`. Preserve cancellation, authority, scope and fallback conditions. Return skill `compoundRecovery` and the actual compound outcome.

Common routes for goals without a more specific match:
- For public evidence, call `investigatePublicQuestion(goal)`. For research alone return its actual result with the same status. For a document revision call `reviseWorkspaceDocument` with null evidence if workspace information suffices, or pass verified public research if required. Insufficient required research stops revision. Return the actual outcome and research for a successful combined result. Keep all user scope and restrictions.
- Live workspace panel inspection or operation: `workInBrowser(goal)` inspects current display, checks authority for the visible control, and reads it back. Return its actual outcome.
- Declared workspace test or requested verification: `verifyWorkspaceSuite(goal)` returns the chosen route and actual result. Answer declaration-only questions without running tests.

Workspace engineering, evidence and delivery:
- `reviewBoardMigration → boardMigration`: rendered legacy board, selected cards and scoped owned reconciliation target.
- `prepareContentProject → preparedContentProject`: new private project from retained current requirements and exact owned approval; distinguish evidence-backed draft, local commit and held authoring.
- `recoverContentArchive → contentArchive`: approved files from an immutable edition into an existing project; verify admitted snapshot and preserve current edits.
- `reconcileWorkspaceConfig → workspaceConfig`: active identity, resolved settings or retained facts needing protected manifests and exact template dependencies.
- `reviseCoordinatedDocuments → coordinatedRevision`: linked existing documents and exact retained approval; check already compliant or hold an unsafe atomic edit.
- `reviewSourceAttribution.reviewRecordedQuestion → provenanceQuestion`: search local rationale, count the exact affected work cohort, or weigh its recorded rejections before reattempting; read-only.
- `reviewSourceAttribution → sourceAttribution`: exact current fragment origin or native rationale from real semantic source; retain local evidence only within user scope.
- `reviewWorkspaceClaims → workspaceClaims`: exact acceptance claim joined to native TestKit, semantic readback and current authority.
- `workOnCapabilityGoal → capabilityPlan`: read-only capability plan, callable signatures or installed provenance, including an explicitly authorized scratch plan.
- `discoverScopedIntent → intentDiscovery`: underspecified local status requiring working state, saved note, installed guide or exact native helper.
- `reviewRetainedMemory → retainedMemory`: remembered claim needing recall, original conversation citations or immutable evidence from permitted historical sources.
- `chooseAuthorizedEvidenceRoute → ownedRouteAuthority`: working, prior, committed, independently retained or approval-only evidence for an owned decision.
- `workOnBridgeDelivery → bridgeDelivery`: local semantic release with retained Git Bridge branch observation and paired file revisions.
- `workOnLocalReconciliationGoal → localReconciliation`: local/incoming settings, approval windows or retained reconciliation evidence.
- `reviewInstalledPackage → installedPackage`: inspect or restore installed worker declaration, exact approved baseline and verification route.
- `templateMigration.reviewTemplateMigration → templateMigration`: installed template vs local candidate, safe adoption, ownership or exact local handoff; distinct from assembly and website publication.
- `workOnAssemblyGoal → workspaceAssembly`: workspace/template parts and dependencies, exact authorized rollout revision or local assembly draft.
- `prepareOwnedScaffold → scaffoldReview`: native starter for a product outcome and its exact private draft.
- `reviewDeployedInterface → deployedInterface`: installed/deployed agent, worker or extension RPC and allowed local review scope.
- `reviewUnitHandoffGoal → unitHandoff`: compare installed unit manifest or identity evidence, and prepare a local icon draft only when allowed.
- `reviewExtensionDossier → extensionDossier`: candidate vs protected/deployed extension, approval or permission changes, or rollback dossier.
- `maintainWorkspaceSkill → skillMaintenance`: one reusable skill after retained typed contract failure.
- `workOnAuthoringGoal → authoring`: current Natlang authoring, release compatibility or compiler evidence.
- `workOnProgramRunGoal → programRun`: actual typed program trial, verified result receipt or callable inspection for that trial.
- `reviewWorkspaceSmoke → workspaceSmoke`: installed Omnibox or shortcuts against an approved local smoke contract; optionally retain a passing result.
- `reviewDevelopmentAudit → developmentAudit`: exact retained development build or session checkpoint after interrupted native work.
- `reviewRetainedBuildIncident → buildIncident`: timing, cache, initial payload, compiler or memory claim from retained build checkpoints.
- `compareTestkitCloseouts → testkitCloseout`: current teardown and retained cleanup evidence for release or an exact private closeout.
- `reviewSystemRelease → systemRelease`: local release handoff from the exact admitted retained System suite run and verified required cases.
- `triageSystemTemplate → systemCandidateTriage`: owned staged System template conflict, coordinate-level incoming vs local changes or private conflict evidence.
- `unitRollout.repairWorkspaceUnit → unitRollout`: owned code defects, build/native verification and explicitly authorized local source rollout.
- `coordinateOwnedOperations → ownedOperations`: local rehearsal with independent impact/recovery workers or release checkpoint carried across owned worker restart.
- `workOnProblemReportGoal → problemReport`: identify the correct local incident before saving or updating its report.
- `reviewWebhookAdmission → webhookAdmission`: local first-party registration audit from retained receipt, current scoped activation and effective metadata.
- `workOnApiReadinessGoal → apiReadiness`: trusted integration profile, quiet required/optional binding readiness or exact audience/transport note.

Execution, clients, and communications:
- `workOnTerminalApp → terminalAppRepair`: diagnose or repair the installed terminal app's source; focused native tests and build.
- `workOnTerminalGoal → terminalHandoff`: owned release checklist or its PTY, including a local suite or scratch evidence.
- `reviewPtyContinuity → ptyContinuity`: original interrupted shell PTY, saved output, actual exit or exact local receipt.
- `recoverCliRoute → cliRoute`: saved CLI invocation's server, workspace route or selected context; distinct from terminal output or PTY resumption.
- `recoverSameTurnEval → sameTurnEval`: user's current task after EvalDO error, timeout or shortened return.
- `workOnEvalHandoffGoal → evalHandoff`: canceled, failed or incomplete native eval settled by verified retained output.
- `recoverAgentCapability → agentCapability`: retained notebook action, console or large output across local revisions, or exact retry of one admitted step.
- `compareLiveLocalInventory → liveLocalInventory`: exact local model eligibility from current inventory and requirements, with conversation continuity.
- `reviewLocalExecutionWidth → localWidth`: retained local model/provider readiness or exact local completed branch width.
- `verifyAndroidDelivery → androidDelivery`: internal Android app installation/validation or dedicated test emulator pairing; distinct from retained mobile session diagnosis.
- `reviewMobileContinuity → mobileContinuity`: retained Android/companion session continuity, release identity, reconnect, startup or routes.
- `planPhoneFirstRun → phoneFirstRun`: owned phone rehearsal, declared desktop install eligibility or retained paired workspace readiness.
- `reviewDesktopReadiness → desktopReadiness`: retained update offers, preserving an open window or responsive placement after reconnect.
- `clients.workOnClientDiagnostics → clientDiagnostics`: compare clients or join an owned renderer to durable GAD evidence.
- `clients.reviewDurableQuestion → gadDurableQuestion`: private handoff based on an individual published user question and current durable participant identity; hold for incomplete or absent roster.
- `reviewNotificationState → notificationState`: owned retained notice, acknowledgment, unread discrepancy, producer change or retired subscription.
- `reviewDeliveryWake → deliveryWake`: interrupted subscription with owned detached mailbox range or exact original terminal receipt.
- `reconcileOwnedMethodCall → localMethodExchange`: exact native result or refusal for a local channel method exchange.
- `localDelivery.workTowardLocalDelivery → localDelivery`: local recipient identity, retained receipts, authorized follow-up and recovery of original attempt.
- `workOnChatContinuity → chatContinuity`: original receipt, stock transcript and default worker continuity for an owned local conversation.
- `workOnProviderHandoffGoal → providerHandoff`: retained provider approval plus original conversation result and scoped local evidence handoff.
- `workOnSpecialistHandoffGoal → specialistHandoff`: choose specialist and verify originating work before authorized local integration handoff.
- `workOnDictationHandoffGoal → dictationHandoff`: acknowledged offline dictation, original source and draft revision or explicitly requested local correction.
- `ownedTaskRecovery.recoverOwnedTask → ownedTaskRecovery`: durable board task, current owner/attempt, recovering local state or authorized tied handoff.
- `recovery.recoverSessionGoal → recovery`: retained conversation and recovery handoff.
- `diagnostics.workTowardDiagnosticGoal → diagnostics`: System host incident evidence, saved log checkpoints and follow-up diagnosis.
- `reviewLogFollower → logFollower`: interrupted native log follow joining saved query and current stream evidence.
- `operator.workOnSystemGoal → operator`: System operations.

Presentation, publication and workspace-specific routes:
- `reviewTranscriptSurface → transcriptSurface`: publish, refresh or retire an approved local card or composer control.
- `chooseAudienceResponse → audienceResponse`: present a local decision and choose interactive controls or simple grounded prose.
- `reviewLocalPresentation → localPresentation`: visualize current owned records, compare display sources or verify accessible private preview.
- `reconcilePanelLaunchState → panelLaunchState`: owned panel launch setting, rejected validator or exact native slot readback.
- `visualRecovery.recoverPanelGoal → visualRecovery`: available panel recovery for interrupted visual state, panel health or a specific owned renderer.
- `migratePanelSource → panelSourceMigration`: existing browser panel source relocation and retained local navigation links.
- `workOnLiveTendrilBoard → liveTendrilBoard`: owned live handoff board presentation, visible state change, layout trial or rollback with durable readback.
- `reviewTendrilRoute → tendrilRoute`: retained local instruction routing, intended room or slot audience and private evidence.
- `reviewWorkspaceShare → workspaceShare`: exact shared object, current author/reader/reviewer scope, grant or retained invitation.
- `reviewAssetIntegrity → assetIntegrity`: signed/working manifests, historical bytes by stable identity or authorized private recovery bundle.
- `generateOwnedIllustration → nativeImage`: owned new image generation, exact native retry or reuse and original-byte save only under current authority; distinct from reviewing retained image candidates.
- `workOnImageCandidateGoal → imageCandidate`: owned retained image attempts, compare prior/current, verify original and permissions, private candidate note only if authorized.
- `publication.publishOwnedPreviewGoal → ownedPreview`: publish, resume or conditionally run an authorized disposable owned preview; confirm exact authority before effects.
- `publication.workTowardPublicationGoal → publication`: website readiness and publication progress.
- `browserMigration.workOnBrowserMigrationGoal → browserMigration`: owned browser migration, retained import evidence or handoff linked to imported bookmarks.
- `pdf.workOnPdfGoal → pdf`: PDF inspection, reading order and accessibility.
- `workOnEditorialPacket → editorialPacket`: Personal editorial mission and approved PDF evidence for a local publication candidate; preserve co-edits and private review scope.
- `workOnDemoPortfolio → demoPortfolio`: paired Examples demo readiness, acceptance card or private Grimoire and Regency handoff.
- `reviewExamplesAdoption → examplesAdoption`: owned Examples composition, whole-unit ownership, inherited settings or private adoption artifact.
- `careForGrimoireScene → grimoireScene`: owned caretaker goal, interactive canvas, accessible labels or scene-specific private artifact.
- `workOnRegencyBriefing → regencyBriefing`: council goal, saved accounts, native forecasts, bounded calendar advance or local handoff.
- `adventureJourney.reviewAdventureJourney → adventureJourney`: saved game recovery, player-scoped evidence and authorized change of pending player input.
- `spectrolite.workOnVaultKnowledgeGoal → vaultWork`: multi-record review, authority or provenance, several linked working changes or owned vault handoff.
- `spectrolite.workTowardVaultGoal → spectrolite`: single-document vault review or correction.
- `workOnNewsEvidenceGoal → newsEvidence`: retained archive/reader windows, exact original article, current schedule lane and private editorial handoff.
- `news.reviewUserNewsGoal → news`: News readers and schedules.
- `googleHandoff.reconcileGoogleHandoff → googleHandoff`: retained Gmail decision determines authority for linked Drive evidence or handoff.
- `googleSetup.workOnGoogleSetupGoal → googleSetup`: current welcome readiness, onboarding, permission ownership or staged setup handoff.
- `google.workOnDriveGoal → google`: Drive. `gmail.recoverGmailGoal → gmail`: drafts and delivery evidence.
- `calendar.workOnCalendarGoal → calendar`: reconcile current proposals and stage a scheduling handoff.
- `personalArtifacts.workOnPersonalArtifactsGoal → personalArtifacts`: saved browser references used in a collection.
- `githubWork.workOnGitHubGoal → githubWork`: local Git evidence, GitHub setup, current owner approvals or protected handoff.
- `personalHistory.reviewPersonalHistory → personalHistory`: historical decisions and recorded milestone evidence.
- `scheduledRecovery.recoverScheduledAutomation → scheduledRecovery`: owned interval/run-cap change, current prerequisites, retained decisions or recovery of authorized schedule handoff.
- `personalAutomation.coordinatePersonalAutomation → personalAutomation`: coordinated authorized monitor changes and interrupted acknowledgment.
- `workOnPersonalWelcomeGoal → personalWelcome`: retained first-run welcome, device/remote/inference/default-agent/update preferences, separate workspace chooser, owned tour cue or permitted retry of current local Explorer sample.
- `personal.workOnMissionGoal → personal`: Mission Control.
