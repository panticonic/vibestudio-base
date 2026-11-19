---
description: Require the original accepted envelope and a verified recipient delivery.
args:
  request: DeliveryInput
returns: ConversationReport
---
Call checkEnvelope and checkSettlement. Combine their blocker lists in that order. Return kind delivery, exact channelId as basis, and ready only when no blocker remains.
