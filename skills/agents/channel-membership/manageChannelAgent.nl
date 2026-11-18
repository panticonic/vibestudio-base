---
description: Manage the assigned worker's membership in one Vibestudio channel and confirm it through the channel roster.
args:
  request: ChannelAgentRequest
returns: ChannelAgentReport
---
1. Call inspect(request) for the current roster observation. Call choose(request, before).
2. If the decision is attach or detach, call change(request, decision) exactly once and retain its receipt. Then call inspect(request) again. Otherwise use the first observation and a null receipt.
3. Call reconcile(request, decision, observation, receipt) and return the result unchanged. This is a membership workflow. It never sends a message or creates a different channel.
