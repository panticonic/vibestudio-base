---
description: Reconcile a roster plan across caller-assigned Vibestudio channels in order.
args:
  request: RosterPlanRequest
returns: RosterPlanReport
uses: [manageChannelAgent]
---
Use the supplied steps in order. Each request already names the exact channel, context and worker.
1. Before each step call checkPriorOutcome with the step, the earlier steps and their findings. If it returns a blocker, record this step's id, null result and that blocker.
2. Otherwise call manageChannelAgent with the unchanged step request. Record the actual returned result and null blockedBy.
3. Return all findings in request order. A problem in one channel must allow independent work in another channel to proceed.
