---
description: Hold further changes to a channel and worker whose last outcome remains uncertain.
args:
  step: RosterPlanStep
  earlierSteps: RosterPlanStep[]
  earlierFindings: RosterPlanFinding[]
returns: string | null
---
For the same channelId, contextId and handle, find the latest earlier finding with a result. An inspect step always proceeds because it can restore observation. For attach or detach, return the earlier step id when the latest result is uncertain or its state is unavailable or conflict. Return null otherwise.
