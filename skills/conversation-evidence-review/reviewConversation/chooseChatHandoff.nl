---
description: Choose the next step at the first unresolved boundary of a conversation handoff.
args:
  chat: ChatDeliveryReport
returns: ChatHandoffStep
readout: decision
---
For history-unverified, choose trace-original-receipt. For panel-mismatch, choose reopen-assigned-chat. For a missing, repeated, or divergent message after a valid panel binding, choose inspect-renderer. For verified, choose ready.
