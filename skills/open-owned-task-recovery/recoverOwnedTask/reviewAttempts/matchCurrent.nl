---
description: Compare exact retained receipts against the current owned task and distinguish older or foreign work.
args:
  current: TaskView
  observed: LaneObservation[]
returns: LaneObservation | null
---
Select the exact acknowledged receipt whose native task ID, title, owner, attempt and artifact agree with the current task. The recipient of the actual replay must be the claimed owner. Select a matching failure or cancellation when that is the terminal outcome. A matching draft is not terminal. Conflicting terminal claims of equal authority are unresolved. Return the actual observation or null.
