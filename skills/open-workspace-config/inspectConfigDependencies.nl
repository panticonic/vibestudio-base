---
description: Read exact direct template declarations from the protected manifest, without acquiring any source.
budget: { maxTurns: 4 }
args:
  mainEvent: string
returns: ConfigDependencies | null
---
Return the exact result of nativeWorkspaceConfig.inspectDependencies(mainEvent).
