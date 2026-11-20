---
description: Find and revise a workspace document using the authoritative evidence already present.
budget: { maxTurns: 32 }
args:
  goal: string
  research: 'ResearchGoalReport | null'
returns: WorkspaceEditReport
---
1. List the available documents. Read the plausible target and evidence documents. Use chooseRevision with these observations and any verified public research to decide which document the user asked to change and prepare the smallest justified revision.
2. Keep the original target observation and the proposed text. Apply a justified revision using the original target's version.
3. When the workspace reports a changed version, read that same target and the authoritative source documents again. Call reconcileRevision with the user's goal, the original target, the proposed text, the latest target, and the freshly observed evidence. If it returns new text, write it once against the latest target's version. If its text is already stored, verify the latest version directly.
4. Read back a successful edit and verify that the stored document is the version and text that were just written. Return its actual path and version. If the edit cannot be safely finished or verified, return blocked with the reason.
