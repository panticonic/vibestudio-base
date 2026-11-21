---
description: Collect the selected active evidence and exact revision and dependency scopes.
budget: { maxTurns: 14 }
args:
  lens: ConfigLens
returns: ConfigEvidence | null
---
1. Call settings.inspectActiveConfig with lens.questions. If it returns null, return null.
2. If lens.inspectManifest, call settings.inspectConfigManifests with the exact questions; otherwise history is null.
3. If lens.inspectDependencies and history exists, call settings.inspectConfigDependencies with the exact history.main.ref. The result states exactly which sources were declared. Never use a working or local committed reference for protected dependency claims.
4. Return active, history and dependencies using the original returned values.
