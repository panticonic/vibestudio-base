---
description: Find and revise a workspace document using the authoritative evidence already present.
budget: { maxTurns: 32 }
args:
  goal: string
  research: 'ResearchGoalReport | null'
returns: WorkspaceEditReport
---
1. List the available documents. Read the plausible target and evidence documents. Use chooseRevision with these observations and any verified public research to decide which document the user asked to change and prepare the smallest justified revision.
2. Apply only a justified revision, using the original version of the target. If the workspace reports that the document changed, read the latest version and the evidence again. Ask chooseRevision to apply the same user goal to those new observations and any verified public research, preserving unrelated changes. Attempt the revision once more when it is safe.
3. Read back a successful edit and verify that the stored document is the version and text that were just written. Return its actual path and version. If the edit cannot be safely finished or verified, return blocked with the reason.
