---
description: Work toward a user's goal in the current Vibestudio workspace.
budget: { maxTurns: 18 }
args:
  goal: string
returns: UserGoalReport
---
Interpret the user's goal and choose from the available capabilities. If the goal calls for public evidence, call investigatePublicQuestion with the user's goal. For a research-only request, return its actual result with the same status.

If the goal connects exact facts from a local PDF to a working Spectrolite vault change, first call pdf.workOnPdfGoal with the user's unchanged goal. Call authorizePdfVaultHandoff with the goal and the actual PDF result. Call spectrolite.workTowardVaultGoal only for a bound handoff, using its directive unchanged. Return status "workspace-skill-reviewed", skill "pdfVault", and outcome {pdf: the actual PDF result, handoff: the actual handoff, vault: the actual vault result or null when the handoff holds}. Finish this combined route before considering the single-skill routes.

If the user asks to revise a workspace document, call reviseWorkspaceDocument. Pass null for public evidence when the request can be fulfilled from workspace information alone. When the goal requires verifying a fact publicly before revising, pass the successful research result to the revision. Stop before revising if the required research is insufficient. Return the actual outcome and include the research in a successful combined result. Preserve the user's scope and restrictions.

For panel health, an interrupted visual surface, or a request to restore a specific owned renderer, use visualRecovery.recoverPanelGoal when its panel recovery capability is available. Pass the unchanged goal and return its actual outcome with status "workspace-skill-reviewed" and skill "visualRecovery".

If the goal asks to inspect or operate the live workspace panel, call workInBrowser with the goal. It inspects what the panel currently shows, determines whether a visible control is authorized, and reads back the result. Return its actual outcome.

If the goal asks about a declared workspace test or asks you to verify something by running such a test, call verifyWorkspaceSuite with the goal. Return the chosen route and the actual result. A request about a declaration can be answered without execution.

When the user asks to publish, resume, or conditionally run an authorized publication to a disposable owned preview, use publication.publishOwnedPreviewGoal. It checks the exact authorization and can make the requested preview change. Return status "workspace-skill-reviewed", skill "ownedPreview", and the actual result as outcome.

When the current workspace exposes a skill that addresses the goal, pass the user's goal to the relevant available callable.

- For recovering a cancelled, failed, or incomplete native eval and handing off verified retained output, call workOnEvalHandoffGoal with the user's goal. Return status "workspace-skill-reviewed", skill "evalHandoff", and its actual outcome.
- For an actual typed program trial, a verified output receipt, or inspecting a callable specifically for a requested trial, call workOnProgramRunGoal with the user's goal. Return status "workspace-skill-reviewed", skill "programRun", and its actual outcome.
- For reviewing the current authored Natlang program, release compatibility, or compiler evidence, call workOnAuthoringGoal with the user's goal. Return status "workspace-skill-reviewed", skill "authoring", and its actual outcome.

- `news.reviewUserNewsGoal` for News readers and schedules.
- `spectrolite.workTowardVaultGoal` for Spectrolite vaults.
- `googleHandoff.reconcileGoogleHandoff` when a retained Gmail decision determines which linked Drive evidence or handoff is authorized.
- `google.workOnDriveGoal` for Drive, and `gmail.recoverGmailGoal` for Gmail drafts and delivery evidence.
- `calendar.workOnCalendarGoal` for reconciling current calendar proposals and staging a scheduling handoff.
- `personalArtifacts.workOnPersonalArtifactsGoal` for saved browser references and their use in a collection.
- `personalHistory.reviewPersonalHistory` for historical decisions and evidence across recorded milestones.
- `personalAutomation.coordinatePersonalAutomation` for coordinated changes across authorized monitors, including interrupted acknowledgments.
- `personal.workOnMissionGoal` for Mission Control.
- `diagnostics.workTowardDiagnosticGoal` for System host incident evidence, saved log checkpoints, and follow-up diagnosis.
- `operator.workOnSystemGoal` for System operations.
- `localDelivery.workTowardLocalDelivery` for local recipient identity, retained delivery receipts, authorized follow-up, and recovering the original attempt.
- `recovery.recoverSessionGoal` for retained conversations and recovery handoffs.
- `publication.workTowardPublicationGoal` for website readiness and publication progress.
- `pdf.workOnPdfGoal` for PDF inspection, reading order, and accessibility.

Return status "workspace-skill-reviewed", the called folder's name as skill, and the actual returned value as outcome.
