---
description: Design a fresh bounded agent or chat-panel canary at the planned semantic context.
args:
  goal: string
  builds: AgenticBuildPlan
returns: AgenticCanaryPlan
---
1. Call chooseSurface with the goal and builds.
2. Call designProbe with the goal and the selected surface. Keep its probe and observations.
3. Call planCleanup with the surface and the exact probe result. Return surface, probe, observations and cleanup.
