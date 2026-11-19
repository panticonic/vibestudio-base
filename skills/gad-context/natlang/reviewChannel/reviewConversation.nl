---
description: Read and interpret the bounded recent conversation.
args:
  operationId: string
  goal: string
returns: ConversationReview
---
Call readConversation for the assigned operation. Then call interpretLatest with the returned evidence and goal, and return its review.
