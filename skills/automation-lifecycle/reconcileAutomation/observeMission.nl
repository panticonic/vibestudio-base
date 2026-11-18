---
description: Read the exact assigned automation's state and revision from the controller.
args:
  missionId: string
returns: MissionObservation | null
---
Return await automationLifecycleRead.observe(missionId) unchanged. An unavailable observation is null.
