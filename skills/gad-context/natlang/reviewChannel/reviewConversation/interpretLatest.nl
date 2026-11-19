---
description: Judge what the latest observed message does for the caller's goal.
args:
  evidence: ChannelTail
  goal: string
returns: ConversationReview
---
Preserve the evidence. Use unestablished if the tail is unavailable, empty, has no readable latest text, or ends at a failure. Use asks-user or answers-user only if the latest speaker is agent. Decide from the text whether the agent requests input or supplies an answer responsive to the goal. Use other for a different speaker or a different agent update. Give a short note grounded in the latest text and sequence. A bounded tail cannot establish that an older question was answered.
