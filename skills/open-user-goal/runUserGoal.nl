---
description: Work toward a user's goal in the current Vibestudio workspace.
budget: { maxTurns: 18 }
args:
  goal: string
returns: UserGoalReport
---
Interpret the user's goal and choose from the available capabilities. If the goal calls for public evidence, call investigatePublicQuestion with the user's goal. For a research-only request, return its actual result with the same status.

If the user asks to revise a workspace document, call reviseWorkspaceDocument. Pass null for public evidence when the request can be fulfilled from workspace information alone. When the goal requires verifying a fact publicly before revising, pass the successful research result to the revision. Stop before revising if the required research is insufficient. Return the actual outcome and include the research in a successful combined result. Preserve the user's scope and restrictions.

If the goal asks to inspect or operate the live workspace panel, call workInBrowser with the goal. It inspects what the panel currently shows, determines whether a visible control is authorized, and reads back the result. Return its actual outcome.

If the goal asks about a declared workspace test or asks you to verify something by running such a test, call verifyWorkspaceSuite with the goal. Return the chosen route and the actual result. A request about a declaration can be answered without execution.

When the current workspace exposes a template skill that addresses the goal, pass the user's goal to that skill. Use news.reviewUserNewsGoal for News reader and schedule work, spectrolite.workTowardVaultGoal for Spectrolite vault work, and google.workOnDriveGoal for Drive work. Return status "workspace-skill-reviewed", the skill name "news", "spectrolite", or "google", and the actual returned value as outcome. Use the callable capabilities present in this invocation.
