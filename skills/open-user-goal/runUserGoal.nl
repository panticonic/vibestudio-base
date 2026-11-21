---
description: Work toward a user's goal in the current Vibestudio workspace.
budget: { maxTurns: 18 }
args:
  goal: string
returns: UserGoalReport
---

1. Identify the requested outcome and any limits on what may change. Use the current callable declarations and host service scopes to find a route that can accomplish it. A callable can be installed while its required services are absent. When the host lists a relevant service under a scope, look for that branch first. For example, a scope `runUserGoal/mail/recoverDraft.nl` points to `mail.recoverDraft`; scopes farther inside that branch describe its children's services. Inspect an uncertain callable with `read_code`.
2. Pass the original `goal` into the chosen route unless a composed call needs observed results as additional inputs. Use the requested outcome to resolve ambiguity between routes that share services. Prefer read-only discovery if intent, current state, or authority is uncertain. If a child reports a missing service, revisit the current scope and look for another route that covers the same request. Before retrying an operation, check whether the attempted call already changed anything.
3. Return what actually happened. For a workspace skill use `{status: "workspace-skill-reviewed", skill: key, outcome: actualChildResult}`. Below, `callable → key` gives the result label. If the goal cannot be completed within the current workspace, state which required capability or evidence is missing.

Composite outcomes:
- A vault revision grounded in a local PDF uses `pdf.workOnPdfGoal(goal)` and `authorizePdfVaultHandoff(goal, pdfResult)`. Call `spectrolite.workTowardVaultGoal` with its directive only when the handoff is bound. Report `pdfVault` with the actual `{pdf, handoff, vault}` and null vault on hold.
- A local handoff that needs verified native recovery uses `workOnEvalHandoffGoal` to recover within the goal's scope, then `workOnRecoveryHandoff(goal, actualRecovery)`. Report `compoundRecovery` with the actual result and preserve all scope, authority, and cancellation conditions.
- Public evidence uses `investigatePublicQuestion(goal)`. For research alone return its result. When a document change depends on public findings, pass verified research to `reviseWorkspaceDocument` only after establishing the required evidence. Report the actual research and revision.

Common workspace entry points:
- Explicit public URLs for evidence or a decision: `answerFromAssignedPublicSources → publicBrief`.
- A local document change supported by workspace evidence: return the result of `reviseWorkspaceDocument(goal, null)`.
- Work on the current panel: `workInBrowser`. Use only visible authorized controls and read back changes.
- Inspect or run a declared workspace suite: `verifyWorkspaceSuite`. Execute only when requested.
- Activate a new private schedule only when the goal requests it and retained consent authorizes it: `activateOwnedAutomation → automationActivation`. Existing schedule recovery uses `scheduledRecovery.recoverScheduledAutomation → scheduledRecovery`; coordinated monitor changes use `personalAutomation.coordinatePersonalAutomation → personalAutomation`.

Workspace engineering:
- `reviewBoardMigration → boardMigration` (rendered legacy board); `prepareContentProject → preparedContentProject` (approved private project); `recoverContentArchive → contentArchive` (immutable edition).
- `reconcileWorkspaceConfig → workspaceConfig` (resolved settings and protected template dependencies); `reviseCoordinatedDocuments → coordinatedRevision` (linked document edits).
- `reviewSourceAttribution.reviewRecordedQuestion → provenanceQuestion` (retained rationale and rejected work); `reviewSourceAttribution → sourceAttribution` (current fragment origin).
- `reviewWorkspaceClaims → workspaceClaims` (TestKit and semantic acceptance evidence); `workOnCapabilityGoal → capabilityPlan` (available interfaces and exact callable signatures); `discoverScopedIntent → intentDiscovery` (ambiguous local status).
- `reviewRetainedMemory → retainedMemory` (original conversation or archive evidence); `chooseAuthorizedEvidenceRoute → ownedRouteAuthority` (working, prior, committed, independently retained or approval-only evidence).
- `workOnBridgeDelivery → bridgeDelivery` (Git Bridge branch and paired file revisions); `workOnLocalReconciliationGoal → localReconciliation` (local and incoming state).
- `reviewInstalledPackage → installedPackage`; `templateMigration.reviewTemplateMigration → templateMigration`; `workOnAssemblyGoal → workspaceAssembly`; `prepareOwnedScaffold → scaffoldReview`.
- `reviewDeployedInterface → deployedInterface` (installed/deployed RPC); `reviewUnitHandoffGoal → unitHandoff` (unit manifest and visual identity); `reviewExtensionDossier → extensionDossier` (release candidates, permissions, and rollback).
- `maintainWorkspaceSkill → skillMaintenance` (reusable skill repair after a typed failure); `workOnAuthoringGoal → authoring` (Natlang compiler and compatibility); `workOnProgramRunGoal → programRun` (typed invocation, receipt, or callable inspection).
- `reviewWorkspaceSmoke → workspaceSmoke` (Omnibox and shortcuts); `reviewDevelopmentAudit → developmentAudit` (interrupted build session); `reviewRetainedBuildIncident → buildIncident` (build performance or memory evidence).
- `compareTestkitCloseouts → testkitCloseout` (teardown and cleanup); `reviewSystemRelease → systemRelease` (retained System suite results); `triageSystemTemplate → systemCandidateTriage` (template conflicts).
- `unitRollout.repairWorkspaceUnit → unitRollout` (authorized source rollout); `coordinateOwnedOperations → ownedOperations` (worker restart and retained checkpoints); `workOnProblemReportGoal → problemReport` (private incident report).
- `reviewWebhookAdmission → webhookAdmission` (registration and activation metadata); `workOnApiReadinessGoal → apiReadiness` (integration audience, transport, and bindings).

Execution and continuity:
- `workOnTerminalApp → terminalAppRepair` (terminal app source); `workOnTerminalGoal → terminalHandoff` (release checklist or PTY); `reviewPtyContinuity → ptyContinuity` (original session output and exit); `recoverCliRoute → cliRoute` (saved CLI scope).
- `recoverSameTurnEval → sameTurnEval` (current task failure); `workOnEvalHandoffGoal → evalHandoff` (retained original result); `recoverAgentCapability → agentCapability` (notebook action, console or large output).
- `compareLiveLocalInventory → liveLocalInventory` (current model eligibility); `reviewLocalExecutionWidth → localWidth` (retained provider readiness or branch width).
- `auditAndroidGoal → androidGoalAudit` (passive exact target audit); `verifyAndroidDelivery → androidDelivery` (disposable emulator installation or validation); `reviewMobileContinuity → mobileContinuity` (retained session startup, reconnect or route).
- `planPhoneFirstRun → phoneFirstRun` (phone rehearsal and desktop eligibility); `reviewDesktopReadiness → desktopReadiness` (update offers and window continuity).
- `clients.workOnClientDiagnostics → clientDiagnostics` (renderer and durable client evidence); `clients.reviewDurableQuestion → gadDurableQuestion` (published question and current roster).
- `reviewNotificationState → notificationState` (notice and acknowledgment); `reviewDeliveryWake → deliveryWake` (subscription interruption and mailbox wake); `reconcileOwnedMethodCall → localMethodExchange` (channel method receipt).
- `localDelivery.workTowardLocalDelivery → localDelivery` (local recipient and original delivery); `workOnChatContinuity → chatContinuity` (transcript and default worker).
- `workOnProviderHandoffGoal → providerHandoff`; `workOnSpecialistHandoffGoal → specialistHandoff`; `workOnDictationHandoffGoal → dictationHandoff` (original source and draft).
- `ownedTaskRecovery.recoverOwnedTask → ownedTaskRecovery` (board task and current attempt); `recovery.recoverSessionGoal → recovery` (retained conversation).
- `diagnostics.workTowardDiagnosticGoal → diagnostics` (host incident); `reviewLogFollower → logFollower` (saved query and current stream); `operator.workOnSystemGoal → operator` (System operations).

Presentation and workspace-specific routes:
- `reviewTranscriptSurface → transcriptSurface` (local card or composer control); `chooseAudienceResponse → audienceResponse` (interactive controls or prose); `reviewLocalPresentation → localPresentation` (accessible current evidence).
- `reconcilePanelLaunchState → panelLaunchState` (native slot and launch setting); `visualRecovery.recoverPanelGoal → visualRecovery` (interrupted renderer); `migratePanelSource → panelSourceMigration` (existing panel source relocation).
- `workOnLiveTendrilBoard → liveTendrilBoard` (live board layout or retained build); `reviewTendrilRoute → tendrilRoute` (local room or slot instructions).
- `reviewWorkspaceShare → workspaceShare` (object and grant); `reviewAssetIntegrity → assetIntegrity` (manifest and stable historical bytes).
- `generateOwnedIllustration → nativeImage` (authorized new image, exact retry or reuse); `workOnImageCandidateGoal → imageCandidate` (compare retained attempts and originals).
- `publication.publishOwnedPreviewGoal → ownedPreview` (authorized disposable preview); `publication.workTowardPublicationGoal → publication` (website readiness and publication).
- `browserMigration.workOnBrowserMigrationGoal → browserMigration` (retained browser import and authority); `pdf.workOnPdfGoal → pdf` (PDF inspection, layout and accessibility).
- `workOnEditorialPacket → editorialPacket` (Personal mission and approved local PDF source); `workOnDemoPortfolio → demoPortfolio` (paired Examples readiness).
- `reviewExamplesAdoption → examplesAdoption`; `careForGrimoireScene → grimoireScene`; `workOnRegencyBriefing → regencyBriefing`; `adventureJourney.reviewAdventureJourney → adventureJourney`.
- `spectrolite.workOnVaultKnowledgeGoal → vaultWork` (multi-record provenance, authority or handoff); `spectrolite.workTowardVaultGoal → spectrolite` (single-document vault review or correction).
- `workOnNewsEvidenceGoal → newsEvidence` (original articles and retained schedule evidence); `news.reviewUserNewsGoal → news` (reader and schedule operations); `prepareNewsEditionReview → newsEditionReview` (visual editorial packet).
- `gmail.recoverGmailGoal → gmail` (retained compose, provider draft and delivery continuity); `googleHandoff.reconcileGoogleHandoff → googleHandoff` (Gmail decision determines access to linked Drive evidence).
- `google.workOnDriveGoal → google` (Drive); `googleSetup.workOnGoogleSetupGoal → googleSetup` (onboarding and permission ownership).
- `calendar.workOnCalendarGoal → calendar` (schedule proposals and handoff); `reconcileGoogleRunbook → googleRunbook` (Calendar evidence and approval for a local runbook).
- `personalArtifacts.workOnPersonalArtifactsGoal → personalArtifacts` (browser library and collections); `githubWork.workOnGitHubGoal → githubWork` (owned local Git evidence and current GitHub owner authority).
- `personalHistory.reviewPersonalHistory → personalHistory` (archive milestones); `workOnPersonalWelcomeGoal → personalWelcome` (first-run welcome, preferences and tour); `personal.workOnMissionGoal → personal` (Mission Control).
