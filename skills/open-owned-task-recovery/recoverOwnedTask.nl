---
description: Recover a current owned task from durable participant evidence and verify an authorized local handoff.
args:
  goal: string
returns: RecoveryReport
budget: { maxTurns: 22 }
---
1. Call findTask with the unchanged goal. If the specific task cannot be distinguished, return task null and the reason.
2. Call reviewAttempts with the goal and actual task. Keep the exact current terminal receipt, if established, and the observed local recipients.
3. Call advanceTask to choose the authorized change. Use advanceTask.moveTask for a change. Reread via findTask.readTask and re-evaluate the earlier attempts against the newer task after a changed result. Use reviewAttempts.matchCurrent with the current task and earlier lane observations; they are receipts, not a license to change a new attempt. Never repeat a stale action. Read the actual task after any accepted effect.
4. If the user requests a local handoff and its evidence and permission are established, call deliverHandoff with the actual current task and the previously observed lane. Report the original attempt and actual readback. A lost acknowledgment is a reason to read back the original attempt.
When the requested answer needs the artifact itself, distinguish an acknowledged filename from actual retained contents. An observed artifactRef identifies readable output; readArtifact accepts the current task and inspected lane. Use actual returned bytes for requested measurements or findings. A receipt without an artifact reference does not establish contents; explain that absence rather than inventing them. Choose the composition that answers the user's request.
5. Return any requested retained result as result, with its actual name, reference and content. Return the exact current task ID, revision, and status, the original verified terminal receipt or null, the actual delivery or null, and the grounded reason.
