---
description: Require the actual chat panel to be ready in the assigned context and bound to the verified channel.
args:
  request: ChatDeliveryRequest
  channelId: string
  panel: ChatDeliveryPanel
returns: boolean
---
Return true only if panelId, contextId, and channelId exactly match the assignment and verified channel, the source is panels/chat, and the phase is ready. Check all these conditions before interpreting displayed text.
