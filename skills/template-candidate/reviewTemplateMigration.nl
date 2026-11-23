---
description: Work through an open workspace template migration review using deployed and local evidence.
uses: [stageTemplateCandidate]
args:
  goal: string
returns: MigrationReport
budget: { maxTurns: 36 }
---
1. Discover the installed template and current dossier with templateMigration.discover. Call chooseMigrationEvidence with the goal and that observation. Pass the chosen IDs with the exact revision to templateMigration.read. If it returns null, rediscover and repeat once from the new observation. Keep the actual read receipts.
2. Call decideMigration with the unchanged goal, current observation and actual read receipts. If the receipt was unavailable, give the decision child an empty list and do not prepare or hand off.
3. For an explicitly authorized preparation, obtain the exact request using templateMigration.authorizeStage with the observed revision and chosen candidate ID. If it returns a request, pass it unchanged to stageTemplateCandidate. Do not use a substitute source or a different operation. Interpret the actual preparation report with finishMigration. Do not call a preparation a deployment.
4. For the recipient supported by the decision and the requested local handoff, call templateMigration.stageHandoff with the observed revision, candidate ID, final disposition and exact recipient. Return the actual receipt or null. Return status, exact selected candidate ID, actual handoff or null, and a concise grounded answer.

Return chosen status, exact candidate ID, actual handoff or null, and the requested grounded answer.
