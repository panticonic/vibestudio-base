---
description: Read the scoped working, committed, and protected manifests independently.
budget: { maxTurns: 4 }
args:
  questions: ConfigQuestion[]
returns: ConfigHistory | null
---
Return the exact result of nativeWorkspaceConfig.inspectManifests(questions).
