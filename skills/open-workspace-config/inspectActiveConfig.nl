---
description: Observe the exact active workspace and requested resolved settings.
budget: { maxTurns: 4 }
args:
  questions: ConfigQuestion[]
returns: ConfigIdentity | null
---
Return the exact result of nativeWorkspaceConfig.inspectActive(questions).
