---
description: Verify exact workspace membership, retained invite and object role, then prepare a private handoff only if authorized.
args:
  goal: string
returns: WorkspaceShareOutcome
budget: { maxTurns: 21 }
---
1. Call discoverShare and identifyShare with the unchanged goal and assignment. Preserve the actual object, actor, invite and grant evidence.
2. Call reviewSharePolicy with the assignment and observation. Only a stage-author, stage-reviewer or stage-reader result permits stageShare. Pass the exact observation and decision.
3. Return the assignment, observation, finding and exact handoff receipt or null. Preserve shared objects, membership, and invitation state.
