---
description: Inspect retained participant outcomes and current local delivery choices.
args:
  goal: string
  current: TaskView
returns: ReviewedAttempts
budget: { maxTurns: 16 }
---
1. Call listLanes. Read plausible task history and relevant competing lanes with readLane. For a user-authorized local handoff, inspect the named destination with its exact mentioned handle if present. Other history reads use a null recipient.
2. Call matchCurrent with the actual card and observed lanes. Keep the exact matching receipt and all observed lanes. If several attempts conflict at the same authority and the current outcome cannot be confirmed, leave terminal null.
