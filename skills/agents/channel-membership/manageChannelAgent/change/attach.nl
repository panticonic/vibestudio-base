---
description: Attach the exact worker with the caller's requested replay and response behavior.
args:
  request: ChannelAgentRequest
returns: MembershipReceipt
---
When options are present, call channelAgentAttach.attach(request, request.options) once and return its receipt. Inherit uses workspace response defaults. mentioned-strict limits the response behavior to explicit addressing. A selected modelRef overrides the workspace model for this new membership. The replay choice admits eligible history only when requested. With missing options return blocked and a null participant ID.
