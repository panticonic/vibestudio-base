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
Call policy.reconcileRevision with goal, original, proposedText, latest, refreshedEvidence, research. Return its exact result.
