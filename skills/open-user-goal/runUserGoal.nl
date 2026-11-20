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

If the goal asks to inspect or operate the live workspace panel, call workInBrowser with the goal. It inspects what the panel currently shows, determines whether a visible control is authorized, and reads back the result. Return its actual outcome.

If the goal asks about a declared workspace test or asks you to verify something by running such a test, call verifyWorkspaceSuite with the goal. Return the chosen route and the actual result. A request about a declaration can be answered without execution.

When the current workspace exposes a skill that addresses the goal, pass the user's goal to the relevant available callable.

- `news.reviewUserNewsGoal` for News readers and schedules.
- `spectrolite.workTowardVaultGoal` for Spectrolite vaults.
- `google.workOnDriveGoal` for Drive, and `gmail.recoverGmailGoal` for Gmail drafts and delivery evidence.
- `calendar.workOnCalendarGoal` for reconciling current calendar proposals and staging a scheduling handoff.
- `personalArtifacts.workOnPersonalArtifactsGoal` for saved browser references and their use in a collection.
- `personal.workOnMissionGoal` for Mission Control.
- `operator.workOnSystemGoal` for System operations.
- `recovery.recoverSessionGoal` for retained conversations and recovery handoffs.
- `publication.workTowardPublicationGoal` for website readiness and publication progress.
- `pdf.workOnPdfGoal` for PDF inspection, reading order, and accessibility.

Return status "workspace-skill-reviewed", the called folder's name as skill, and the actual returned value as outcome.
