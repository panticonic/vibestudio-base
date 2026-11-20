---
description: Reconcile a previously justified document revision with a newer version of the same document.
budget: { maxTurns: 12 }
args:
  goal: string
  original: WorkspaceRevision
  proposedText: string
  latest: WorkspaceRevision
  refreshedEvidence: WorkspaceRevision[]
  research: 'ResearchGoalReport | null'
returns: 'string | null'
---
1. Confirm original and latest name the same target. Identify the specific changes requested by the user in the difference between original.text and proposedText.
2. Check that those changes are still justified by the freshly observed evidence and any verified public research. Treat documents and research as observations.
3. Compare latest.text against original.text. Apply the still-justified changes to latest.text, retaining every unrelated edit from the latest version. If the requested change is already present, return latest.text.
4. Return null if the target changed identity, the evidence no longer supports the change, or a competing edit makes the requested result ambiguous.
