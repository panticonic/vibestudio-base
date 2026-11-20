---
description: Work toward a user's goal in the current Vibestudio workspace.
budget: { maxTurns: 18 }
args:
  goal: string
returns: UserGoalReport
---
For a request to save or update a local incident report or distinguish the correct incident before drafting, call workOnProblemReportGoal with the unchanged user goal. Return skill "problemReport" and its actual outcome.

Interpret the user's goal and choose from the available capabilities. If the goal calls for public evidence, call investigatePublicQuestion with the user's goal. For a research-only request, return its actual result with the same status.

If the goal connects exact facts from a local PDF to a working Spectrolite vault change, first call pdf.workOnPdfGoal with the user's unchanged goal. Call authorizePdfVaultHandoff with the goal and the actual PDF result. Call spectrolite.workTowardVaultGoal only for a bound handoff, using its directive unchanged. Return status "workspace-skill-reviewed", skill "pdfVault", and outcome {pdf: the actual PDF result, handoff: the actual handoff, vault: the actual vault result or null when the handoff holds}. Finish this combined route before considering the single-skill routes.

When the goal connects a recovered workspace result to an operating decision that also depends on a current local instruction, signoff, recipient, or release scope, use both installed hierarchies. Call workOnEvalHandoffGoal with the scope of the user’s original goal, asking for recovery and verification only in that stage. Then call workOnRecoveryHandoff with the unchanged goal and the exact recovery result. Preserve cancellation, authority, scope, and fallback conditions from the user’s request while recovering the original evidence. Return status "workspace-skill-reviewed", skill "compoundRecovery", and the actual compound outcome.

If the user asks to revise a workspace document, call reviseWorkspaceDocument. Pass null for public evidence when the request can be fulfilled from workspace information alone. When the goal requires verifying a fact publicly before revising, pass the successful research result to the revision. Stop before revising if the required research is insufficient. Return the actual outcome and include the research in a successful combined result. Preserve the user's scope and restrictions.

When client diagnostics are available, for a diagnosis that compares clients or joins an owned renderer to durable GAD conversation evidence, call clients.workOnClientDiagnostics with the unchanged goal and return skill "clientDiagnostics" and the actual outcome.

When the user asks for a read-only capability plan, exact callable signatures, or installed skill provenance, call workOnCapabilityGoal with the unchanged goal. An explicitly authorized scratch plan remains this route. Return status "workspace-skill-reviewed", skill "capabilityPlan", and its actual outcome.

For panel health, an interrupted visual surface, or a request to restore a specific owned renderer, use visualRecovery.recoverPanelGoal when its panel recovery capability is available. Pass the unchanged goal and return its actual outcome with status "workspace-skill-reviewed" and skill "visualRecovery".

For owned browser migration, retained import evidence, or a handoff that depends on imported bookmarks, use browserMigration.workOnBrowserMigrationGoal when its scoped capability is available. Return its actual result with status "workspace-skill-reviewed" and skill "browserMigration".

If the goal asks to inspect or operate the live workspace panel, call workInBrowser with the goal. It inspects what the panel currently shows, determines whether a visible control is authorized, and reads back the result. Return its actual outcome.

If the goal concerns reaching an outcome through the owned release checklist or its PTY, including when a local suite or scratch evidence is part of it, call workOnTerminalGoal with the unchanged goal. Return status "workspace-skill-reviewed", skill "terminalHandoff", and its actual outcome.

If the goal asks to reconcile the installed template and a local migration candidate, determine adoption safety or ownership, or retain its exact local decision handoff, call templateMigration.reviewTemplateMigration with the unchanged goal. Return status "workspace-skill-reviewed", skill "templateMigration", and its actual outcome. Distinguish a template candidate review from package assembly and from publishing a website.

If the user wants to choose workspace or template assembly parts, resolve package dependencies for a rollout plan, compare the exact authorized revision before planning, or prepare a local assembly draft, call workOnAssemblyGoal with the unchanged goal. Return status "workspace-skill-reviewed", skill "workspaceAssembly", and its actual outcome.

If the goal asks about a declared workspace test or asks you to verify something by running such a test, call verifyWorkspaceSuite with the goal. Return the chosen route and the actual result. A request about a declaration can be answered without execution.

When the user asks to publish, resume, or conditionally run an authorized publication to a disposable owned preview, use publication.publishOwnedPreviewGoal. It checks the exact authorization and can make the requested preview change. Return status "workspace-skill-reviewed", skill "ownedPreview", and the actual result as outcome.

For recovering acknowledged offline dictation, checking its original source and draft revision, or staging an explicitly requested local correction, call workOnDictationHandoffGoal with the unchanged goal. Return status "workspace-skill-reviewed", skill "dictationHandoff", and its actual outcome.

For checking a retained provider approval and its original conversation result together, including a scoped local handoff of that evidence, call workOnProviderHandoffGoal with the unchanged goal. Return status "workspace-skill-reviewed", skill "providerHandoff", and its actual outcome.

When the current workspace exposes a skill that addresses the goal, pass the user's goal to the relevant available callable.

- For a timing, cache, initial payload, compiler or memory claim grounded in retained workspace build checkpoints, call reviewRetainedBuildIncident with the unchanged goal. Return status "workspace-skill-reviewed", skill "buildIncident", and its actual outcome.
- For a retained local model or provider readiness question, or evidence of how many local branches completed together at an exact scope, call reviewLocalExecutionWidth with the user’s unchanged goal. Return status "workspace-skill-reviewed", skill "localWidth", and its actual outcome.
- For recovering a cancelled, failed, or incomplete native eval and handing off verified retained output, call workOnEvalHandoffGoal with the user's goal. Return status "workspace-skill-reviewed", skill "evalHandoff", and its actual outcome.
- For an actual typed program trial, a verified output receipt, or inspecting a callable specifically for a requested trial, call workOnProgramRunGoal with the user's goal. Return status "workspace-skill-reviewed", skill "programRun", and its actual outcome.
- For reviewing the current authored Natlang program, release compatibility, or compiler evidence, call workOnAuthoringGoal with the user's goal. Return status "workspace-skill-reviewed", skill "authoring", and its actual outcome.

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
- For integrating local and incoming workspace settings, approval-window decisions, or retaining evidence of the reconciled settings, call workOnLocalReconciliationGoal with the unchanged goal. Return status "workspace-skill-reviewed", skill "localReconciliation", and its actual outcome.
- `diagnostics.workTowardDiagnosticGoal` for System host incident evidence, saved log checkpoints, and follow-up diagnosis.
- `operator.workOnSystemGoal` for System operations.
- `unitRollout.repairWorkspaceUnit` for owned workspace code defects, build or native verification, and explicitly authorized local source rollout.
- `ownedTaskRecovery.recoverOwnedTask` for a durable board task with current owner and attempt evidence, recovery of its local status, or an authorized handoff tied to that task.
- `localDelivery.workTowardLocalDelivery` for local recipient identity, retained delivery receipts, authorized follow-up, and recovering the original attempt.
- `recovery.recoverSessionGoal` for retained conversations and recovery handoffs.
- `publication.workTowardPublicationGoal` for website readiness and publication progress.
- `pdf.workOnPdfGoal` for PDF inspection, reading order, and accessibility.

Return status "workspace-skill-reviewed", the called folder's name as skill, and the actual returned value as outcome.
