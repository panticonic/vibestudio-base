---
description: Compare exact retained receipts against the current owned task and distinguish older or foreign work.
args:
  current: TaskView
  observed: LaneObservation[]
returns: LaneObservation | null
---
Select the actual acknowledged receipt whose parsed record matches the current task: record.taskId identifies current.task.id, record.task names current.task.title, and record.owner, attempt and artifact describe the current assignment. The receipt recipient must identify the claimed owner. LaneObservation.owner is a separately requested resolved-owner lookup; null there means no such lookup was requested, not that the explicit native receipt recipient is absent or different. Judge the actual acknowledged receipt and its parsed record together. Select a matching failure or cancellation when that is the terminal outcome. A matching draft is not terminal. Conflicting terminal claims of equal authority are unresolved. Return the actual observation or null.
