---
description: Inspect a legacy board and reconcile a request to retain an authorized subset of its work in this workspace.
budget: { maxTurns: 16 }
args:
  goal: string
returns: BoardMigrationOutcome
---
1. Call locateSource with the original goal and read the exact legacy board. If none can be bound, return held with the missing source.
2. Call boardMigration.readTarget to read the local target and its actual approval. Call chooseMigrationScope with the original goal, rendered source and target basis.
3. Call decideMigration with the original goal and those exact results. It handles comparison, reading an existing target, and any admitted write. Return its exact outcome.
