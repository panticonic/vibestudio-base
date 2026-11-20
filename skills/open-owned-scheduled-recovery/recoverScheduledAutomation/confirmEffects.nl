---
description: Verify the exact schedule after the proposed resolution.
uses: [readSchedule]
args:
  before: Schedule
  resolution: Resolution
returns: Schedule
budget: { maxTurns: 6 }
---
1. Read the same schedule using readSchedule.
2. Confirm its owner, current state, cadence, cap and future occurrence. Return the current observation exactly. Use the latest schedule even when an intervening revision prevented the earlier plan.
