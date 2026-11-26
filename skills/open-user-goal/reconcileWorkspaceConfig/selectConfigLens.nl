---
description: Choose the smallest set of active setting observations and exact evidence bases needed by the user's question.
budget: { maxTurns: 10 }
args:
  goal: string
  brief: ConfigBrief
returns: ConfigLens
---
Use the original goal. Ask for only the relevant fields: panel-restore for panel restoration policy, launch-panels for declared startup panel sources, minimum-app for minimum app version, desktop-client for the desktop default, natlang-provider for the declared Natlang provider, terminal-extensions for the terminal runtime extensions, agent-fast-mode for the default fast-mode setting. Identity, epoch, host version and hub version are already observed separately and require no field. Empty questions is permitted for an identity-only request. Include only distinct relevant fields; their order does not change their identity or meaning.
Set inspectManifest when the user asks about working files, a local commit, protected main or protected template dependency declarations. Set inspectDependencies only when asked to verify template dependency declarations, pinned revisions, or what protected source proves about a remembered installation. A retained note never authorizes work on a different workspace.
