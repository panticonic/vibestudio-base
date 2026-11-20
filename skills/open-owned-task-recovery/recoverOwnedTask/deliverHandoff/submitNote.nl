---
description: Submit one authorized note against the current task revision and native recipient snapshot.
args:
  task: TaskView
  lane: LaneObservation
  body: string
returns: HandoffAttempt
---
Call services.ownedTaskHandoff.submit with task.task.id, task.revision, lane.basis, and body.
