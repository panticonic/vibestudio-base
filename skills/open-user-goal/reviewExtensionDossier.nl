---
description: Compare one extension candidate, live release and owner decision before preparing any local verification dossier.
args:
  goal: string
returns: ExtensionDossierOutcome
budget: { maxTurns: 24 }
---
1. Call discoverDossier for the owned assignment and current retained owner scope. Pass the exact request to extensiondev.reviewExtensionRelease and retain its observed report.
2. Call compareCandidate with the actual review, then inspectRelease with the assignment and review. Observe both before deciding a handoff. Keep the latest protected source and the released runtime distinct.
3. Call decideDossier with the assignment and their results. If the requested local dossier is supported by that decision and the matching local grant, call stageDossier with the exact decision. Return its receipt, or null when there is no authorized local artifact.
4. Return finding and actual dossier receipt. No publication, activation, update, restart, rollback, permission change or domain method invocation is part of this review.
