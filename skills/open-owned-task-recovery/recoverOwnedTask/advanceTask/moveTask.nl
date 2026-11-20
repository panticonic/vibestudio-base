---
description: Attempt one exact native task revision transition.
args:
  task: TaskView
  status: TaskStatus
returns: UpdateTaskResult
---
Call services.ownedTaskBoard.transition with task.task.id, task.revision, and status. Return the actual result unchanged.
