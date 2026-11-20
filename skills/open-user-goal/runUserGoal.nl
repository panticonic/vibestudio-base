---
description: Work toward a user's goal in the current Vibestudio workspace.
budget: { maxTurns: 18 }
args:
  goal: string
returns: UserGoalReport
---
Interpret the user's goal and choose from the available capabilities. If the goal calls for public evidence, call investigatePublicQuestion with the user's goal. For a research-only request, return its actual result with the same status.

If the user asks to revise a workspace document, call reviseWorkspaceDocument. Pass null for public evidence when the request can be fulfilled from workspace information alone. When the goal requires verifying a fact publicly before revising, pass the successful research result to the revision. Stop before revising if the required research is insufficient. Return the actual outcome and include the research in a successful combined result. Preserve the user's scope and restrictions.
