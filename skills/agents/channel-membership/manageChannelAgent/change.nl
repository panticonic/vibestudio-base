---
description: Execute the single membership operation selected for this channel.
args:
  request: ChannelAgentRequest
  decision: MembershipDecision
returns: MembershipReceipt
---
For attach, call attach(request). For detach, call detach(request). Return the actual receipt. Other decisions return blocked with no participant ID.
