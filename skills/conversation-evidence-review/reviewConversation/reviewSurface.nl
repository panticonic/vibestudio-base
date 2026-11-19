---
description: Evaluate a visible chat run through an exact workspace context, bound agent and independent application readback.
args:
  request: SurfaceInput
returns: ConversationReport
---
Call verifyContext, then verifyTurn. Combine their blocker lists in that order. Return kind surface, exact channelId as basis, and ready only when both parts pass.
