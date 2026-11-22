---
description: Join exact native receipt and first-party consumer state in the installed delivery reviewer.
args:
  goal: string
  index: ChatIndex
  plan: ChatPlan
  opening: ChatObservation
  current: ChatObservation
returns: ChatEvidence
---
1. Form kind delivery with the goal and plan.channelId. Set channelAccepted only if the current receipt belongs to that channel and its message ID has a durable row. Count only rows with that exact message ID, not unrelated repeated text. Origin must match both sender and text.
2. Recipients resolve when the current consumer belongs to the same channel. Membership is verified by the exact current worker being active and having the same object key and participant ID as the original when the goal requires that worker. Confirm addressed observer membership only. Do not infer reasoning readiness. Otherwise use matching current consumer scope as the membership check for this transcript-only request.
3. Replay meaning matches when the current transcript has exactly one row with the receipt's exact ID, sender and content, and replay has settled in that same channel. Pending means the consumer replay has yet to settle. Delivered is the matched settled projection. Otherwise the scoped review failed. A repeated receipt confirms retry only when its exact replay ID equals the original. With no retry receipt accountedRetry is true.
4. Call policy.reviewConversation with the exact delivery request. Return request and unchanged review.
