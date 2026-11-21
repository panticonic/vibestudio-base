---
description: Work toward a user's goal in the current Vibestudio workspace.
budget: { maxTurns: 18 }
args:
  goal: string
returns: UserGoalReport
---
For choosing among exact local model candidates based on current inventory and task requirements, use compareLiveLocalInventory when it is available. Report skill "liveLocalInventory". This route compares candidate eligibility and conversation continuity.

For an owned live Tendril handoff board that needs presentation, a visible state change, a layout trial or rollback, and durable readback, use workOnLiveTendrilBoard. Report skill "liveTendrilBoard".

For a saved workspace CLI invocation whose server, workspace route or selected context needs confirmation, use recoverCliRoute when available. Report skill "cliRoute". Terminal command output and PTY resumption are separate requests.

For a local operational rehearsal that needs independent impact and recovery workers or a release checkpoint carried across its owned worker restart, call coordinateOwnedOperations when available. Report skill "ownedOperations".

For a request to save or update a local incident report or distinguish the correct incident before drafting, call workOnProblemReportGoal. Return skill "problemReport" and its actual outcome.

When the goal asks whether current Testkit teardown and retained cleanup evidence justify release, or whether to save the exact private closeout, call compareTestkitCloseouts. Report as "testkitCloseout".

For the active workspace identity, resolved configuration or retained facts that need current settings, protected manifests or exact protected template dependency declarations, call reconcileWorkspaceConfig. Report as "workspaceConfig".

For an underspecified local status question that needs choosing between working state, a saved note, an installed guide, and an exact native helper, call discoverScopedIntent. Report as "intentDiscovery".

For choosing between working, prior, committed, independently retained, or approval-only evidence routes in an owned decision, call chooseAuthorizedEvidenceRoute. Report as "ownedRouteAuthority".

For an owned panel launch setting change, validator rejection, or exact native slot readback, call reconcilePanelLaunchState. Report as "panelLaunchState".

For an exact workspace acceptance claim audit matching native TestKit, semantic file readback and current authority, call reviewWorkspaceClaims. Report as "workspaceClaims".

For local semantic release delivery that depends on a retained Git Bridge branch observation and paired file revisions, call workOnBridgeDelivery. Report as "bridgeDelivery".

Interpret the user's goal and choose from the available capabilities. Pass the original goal unchanged unless a step asks for another input. For a named report key, return status "workspace-skill-reviewed", that key as skill, and the exact child result as outcome. Use a route only when its callable is visible in the current workspace. If a requested feature is unavailable, explain what is missing and use an authorized alternative only if it still satisfies the goal. If the goal calls for public evidence, call investigatePublicQuestion with the user's goal. For a research-only request, return its actual result with the same status.

If the goal connects exact facts from a local PDF to a working Spectrolite vault change, first call pdf.workOnPdfGoal with the user's unchanged goal. Call authorizePdfVaultHandoff with the goal and the actual PDF result. Call spectrolite.workTowardVaultGoal only for a bound handoff, using its directive unchanged. Return status "workspace-skill-reviewed", skill "pdfVault", and outcome {pdf: the actual PDF result, handoff: the actual handoff, vault: the actual vault result or null when the handoff holds}. Finish this combined route before considering the single-skill routes.

When the goal connects a recovered workspace result to an operating decision that also depends on a current local instruction, signoff, recipient, or release scope, use both installed hierarchies. Call workOnEvalHandoffGoal with the scope of the user’s original goal, asking for recovery and verification only in that stage. Then call workOnRecoveryHandoff and the exact recovery result. Preserve cancellation, authority, scope, and fallback conditions from the user’s request while recovering the original evidence. Return status "workspace-skill-reviewed", skill "compoundRecovery", and the actual compound outcome.

If the user asks to revise a workspace document, call reviseWorkspaceDocument. Pass null for public evidence when the request can be fulfilled from workspace information alone. When the goal requires verifying a fact publicly before revising, pass the successful research result to the revision. Stop before revising if the required research is insufficient. Return the actual outcome and include the research in a successful combined result. Preserve the user's scope and restrictions.

For a private channel handoff that requires the exact individual published user question and durable current identity of its participant, call clients.reviewDurableQuestion with the original goal when available. Report skill "gadDurableQuestion" and the actual outcome. An incomplete or absent participant roster is a hold.

When client diagnostics are available, for a diagnosis that compares clients or joins an owned renderer to durable GAD conversation evidence, call clients.workOnClientDiagnostics and return skill "clientDiagnostics" and the actual outcome.

When the user asks for a read-only capability plan, exact callable signatures, or installed skill provenance, call workOnCapabilityGoal. An explicitly authorized scratch plan remains this route. Report as "capabilityPlan".

For panel health, an interrupted visual surface, or a request to restore a specific owned renderer, use visualRecovery.recoverPanelGoal when its panel recovery capability is available. Pass the unchanged goal and return its actual outcome with status "workspace-skill-reviewed" and skill "visualRecovery".

For owned browser migration, retained import evidence, or a handoff that depends on imported bookmarks, use browserMigration.workOnBrowserMigrationGoal when its scoped capability is available. Return its actual result with status "workspace-skill-reviewed" and skill "browserMigration".

If the goal asks to inspect or operate the live workspace panel, call workInBrowser with the goal. It inspects what the panel currently shows, determines whether a visible control is authorized, and reads back the result. Return its actual outcome.

If the goal concerns reaching an outcome through the owned release checklist or its PTY, including when a local suite or scratch evidence is part of it, call workOnTerminalGoal. Report as "terminalHandoff".

If the goal asks to reconcile the installed template and a local migration candidate, determine adoption safety or ownership, or retain its exact local decision handoff, call templateMigration.reviewTemplateMigration. Report as "templateMigration". Distinguish a template candidate review from package assembly and from publishing a website.

If the user wants to choose workspace or template assembly parts, resolve package dependencies for a rollout plan, compare the exact authorized revision before planning, or prepare a local assembly draft, call workOnAssemblyGoal. Report as "workspaceAssembly".

If the user asks to inspect or restore an installed worker package declaration, its exact approved baseline, or its resulting verification route, call reviewInstalledPackage. Report as "installedPackage".

If the goal asks about a declared workspace test or asks you to verify something by running such a test, call verifyWorkspaceSuite with the goal. Return the chosen route and the actual result. A request about a declaration can be answered without execution.

When the user asks to publish, resume, or conditionally run an authorized publication to a disposable owned preview, use publication.publishOwnedPreviewGoal. It checks the exact authorization and can make the requested preview change. Return status "workspace-skill-reviewed", skill "ownedPreview", and the actual result as outcome.

For recovering acknowledged offline dictation, checking its original source and draft revision, or staging an explicitly requested local correction, call workOnDictationHandoffGoal. Report as "dictationHandoff".

For selecting a workspace specialist and verifying the originating work before an authorized local integration handoff, call workOnSpecialistHandoffGoal. Report as "specialistHandoff".

For the retained Personal first-run welcome, current device, remote, local inference, default-agent or update preferences, a separate workspace chooser, an owned tour cue, or a permitted retry of the current local Explorer text sample, call workOnPersonalWelcomeGoal. Report as "personalWelcome".

For checking a retained provider approval and its original conversation result together, including a scoped local handoff of that evidence, call workOnProviderHandoffGoal. Report as "providerHandoff".

For the original receipt, stock chat transcript and default worker continuity in an owned local conversation, call workOnChatContinuity. Return status "workspace-skill-reviewed", skill "chatContinuity", and its actual report.

For a local publication candidate tied to a Personal editorial mission and approved local PDF evidence, call workOnEditorialPacket. Preserve co-edits and the private review scope. Report as "editorialPacket".

For a paired Examples demo readiness, acceptance card, or private handoff requiring both Grimoire and Regency, call workOnDemoPortfolio. Report as "demoPortfolio".

For a Regency council goal involving saved accounts, native settlement forecasts, or a bounded calendar advance or local handoff, call workOnRegencyBriefing. Report as "regencyBriefing".

For an owned retained image generation review, compare prior and current attempts, verify the original image and permissions, and make a private local candidate note when authorized. Call workOnImageCandidateGoal. Report as "imageCandidate".

For a News goal requiring cross-checks among retained archive or reader windows, exact original article evidence, the current scheduling lane and a private editorial handoff, call workOnNewsEvidenceGoal. Report as "newsEvidence".

For a trusted API integration profile's quiet binding-readiness review across required and optional endpoints, or a local readiness note based on exact audiences and transports, call workOnApiReadinessGoal. Report as "apiReadiness".

When the current workspace exposes a skill that addresses the goal, pass the user's goal to the relevant available callable.

- For a local channel method exchange where an exact native result or refusal is requested, call reconcileOwnedMethodCall. Report as "localMethodExchange".

- For comparing an extension release candidate and the protected or deployed package, changes in extension approval or permissions, or an extension rollback evidence dossier, call reviewExtensionDossier. Report as "extensionDossier".
- For a timing, cache, initial payload, compiler or memory claim grounded in retained workspace build checkpoints, call reviewRetainedBuildIncident. Report as "buildIncident".
- For maintaining one reusable workspace skill after a retained typed contract failure, call maintainWorkspaceSkill. Report as "skillMaintenance".
- For a desktop client readiness question about retained update offers, preserving an open window or recovering responsive placement after reconnect, call reviewDesktopReadiness. Report as "desktopReadiness".
- For an owned retained notification review, acknowledgment, unread discrepancy, producer replacement or retired notification subscription, call reviewNotificationState. Report as "notificationState".
- To review retained Android or mobile companion continuity, app release identity, reconnect, or retained startup and route evidence, call reviewMobileContinuity. Report as "mobileContinuity".
- To compare signed and working asset manifests, recover historical binary bytes by stable identity, or verify an authorized private recovery bundle, call reviewAssetIntegrity. Report as "assetIntegrity".
- To review how a retained local Tendril instruction would route, check whether a room or slot still has the intended audience, or retain private route evidence, call reviewTendrilRoute. Report as "tendrilRoute".
- To visualize the current owned records, compare possible display sources, or verify an accessible private preview, call reviewLocalPresentation. Report as "localPresentation".
- For an installed or deployed agent, worker, or extension RPC interface and its exact allowed local review scope, call reviewDeployedInterface. Report as "deployedInterface".
- For a retained local model or provider readiness question, or evidence of how many local branches completed together at an exact scope, call reviewLocalExecutionWidth. Report as "localWidth".
- For a local release handoff based on retained System suite results, choosing the exact admitted run and verifying its required cases, call reviewSystemRelease. Report as "systemRelease".
- For an existing browser panel source relocation and its retained local navigation links, call migratePanelSource. Report as "panelSourceMigration".
- For a workspace sharing grant, retained invitation, or current author, reader or reviewer scope on an exact shared object, call reviewWorkspaceShare. Report as "workspaceShare".
- For a retained agent notebook action, console or large output across distinct local revisions, or an exact retry of one admitted capability step, call recoverAgentCapability. Report as "agentCapability".
- For recovering a cancelled, failed, or incomplete native eval and handing off verified retained output, call workOnEvalHandoffGoal with the user's goal. Report as "evalHandoff".
- For an actual typed program trial, a verified output receipt, or inspecting a callable specifically for a requested trial, call workOnProgramRunGoal with the user's goal. Report as "programRun".
- For reviewing the current authored Natlang program, release compatibility, or compiler evidence, call workOnAuthoringGoal with the user's goal. Report as "authoring".
- To choose or prepare a native starter from a product outcome and read its exact private draft, call prepareOwnedScaffold. Report as "scaffoldReview".
- For an owned staged System template conflict, coordinate-level local versus incoming changes or private conflict evidence, call triageSystemTemplate with the unchanged goal. Report as "systemCandidateTriage".
- For an owned Examples composition review of whole-unit ownership, inherited settings or a private adoption artifact, call reviewExamplesAdoption. Report as "examplesAdoption".
- For an owned Grimoire caretaker request about its current interactive canvas, accessible labels or a scene-specific private artifact, call careForGrimoireScene. Report as "grimoireScene".
- For an owned phone first-run rehearsal, declared desktop install eligibility or a retained paired workspace readiness decision, call planPhoneFirstRun. Report as "phoneFirstRun".
- For a local first-party webhook registration audit based on retained receipt, current scoped activation and effective metadata, call reviewWebhookAdmission. Report as "webhookAdmission".
- To recover approved files from an immutable archived edition into an existing local content project, including verifying its admitted snapshot and protecting current edits, call recoverContentArchive. Report as "contentArchive".
- To recover the current user task after an EvalDO tool error, timeout, or shortened return, call recoverSameTurnEval with the whole goal. Return status "workspace-skill-reviewed", skill "sameTurnEval", and the actual report.
- For an interrupted native server-log follow that must join saved query and current streamed evidence, call reviewLogFollower with the whole goal. Return status "workspace-skill-reviewed", skill "logFollower", and the exact report.
- For an interrupted shell console goal about matching the original PTY, resuming saved output, checking the actual exit or preserving its exact local receipt, call reviewPtyContinuity with the entire goal. Return status "workspace-skill-reviewed", skill "ptyContinuity", and its actual outcome.
- For an exact retained development build or session checkpoint review after an interrupted native run, call reviewDevelopmentAudit with the entire goal. Report as "developmentAudit".

- `news.reviewUserNewsGoal` for News readers and schedules.
- `adventureJourney.reviewAdventureJourney` for Adventure save recovery, player-scoped evidence, and an authorized change to pending player input.
- `spectrolite.workOnVaultKnowledgeGoal` for a multi-record Spectrolite review, authority or provenance decision, multiple linked working changes, or an owned vault handoff. Return skill "vaultWork" for this callable.
- `spectrolite.workTowardVaultGoal` for a single-document Spectrolite vault review or correction.
- `googleHandoff.reconcileGoogleHandoff` when a retained Gmail decision determines which linked Drive evidence or handoff is authorized.
- `googleSetup.workOnGoogleSetupGoal` for current Google welcome readiness, onboarding and permission ownership, or staged setup handoffs.
- `google.workOnDriveGoal` for Drive, and `gmail.recoverGmailGoal` for Gmail drafts and delivery evidence.
- `calendar.workOnCalendarGoal` for reconciling current calendar proposals and staging a scheduling handoff.
- `personalArtifacts.workOnPersonalArtifactsGoal` for saved browser references and their use in a collection.
- `githubWork.workOnGitHubGoal` for local Git evidence, GitHub setup and current owner approvals or a protected handoff.
- `personalHistory.reviewPersonalHistory` for historical decisions and evidence across recorded milestones.
- `scheduledRecovery.recoverScheduledAutomation` for an owned interval or run-cap change, current prerequisites and retained schedule decisions, or recovery of its authorized local handoff.
- `personalAutomation.coordinatePersonalAutomation` for coordinated changes across authorized monitors, including interrupted acknowledgments.
- `personal.workOnMissionGoal` for Mission Control.
- For integrating local and incoming workspace settings, approval-window decisions, or retaining evidence of the reconciled settings, call workOnLocalReconciliationGoal. Report as "localReconciliation".
- `diagnostics.workTowardDiagnosticGoal` for System host incident evidence, saved log checkpoints, and follow-up diagnosis.
- `operator.workOnSystemGoal` for System operations.
- `unitRollout.repairWorkspaceUnit` for owned workspace code defects, build or native verification, and explicitly authorized local source rollout.
- `ownedTaskRecovery.recoverOwnedTask` for a durable board task with current owner and attempt evidence, recovery of its local status, or an authorized handoff tied to that task.
- `localDelivery.workTowardLocalDelivery` for local recipient identity, retained delivery receipts, authorized follow-up, and recovering the original attempt.
- `recovery.recoverSessionGoal` for retained conversations and recovery handoffs.
- `publication.workTowardPublicationGoal` for website readiness and publication progress.
- `pdf.workOnPdfGoal` for PDF inspection, reading order, and accessibility.

Return status "workspace-skill-reviewed", the called folder's name as skill, and the actual returned value as outcome.
