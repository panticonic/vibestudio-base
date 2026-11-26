---
description: Decide which scoped migration stages remain and whether they are safe.
args:
  assignment: PanelMigrationAssignment
  observed: MigrationObservation
returns: MigrationFinding
budget: { maxTurns: 17 }
---
Assess the requested migration against these actual observations. Use assessPlacement and assessConsumers for focused reasoning when relevant. Keep a current compatible panel separate from destinationPanel: content projects and terminal apps are not browser-panel build roots. A different destination owner, parked/missing source or invalid caller contract may block the requested work. Exact authority covers only its declared destination and revision.

Describe what is currently true, what would have to change, and any applicable limit. Proposed stages are alternatives the caller may consider under the user goal, not an instruction to call every helper. Preserve historical and foreign callers and actual current coedits. Explain why, using real observations rather than a plan label alone.
