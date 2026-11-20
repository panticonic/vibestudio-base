---
description: Assess whether the selected original delivery is substantiated by its actual retained envelope and readback.
args:
  goal: string
  card: ConversationCard
  current: ConversationRead
  selection: ResultSelection
  output: 'OutputReadback | null'
returns: RetainedDelivery
---
Use conversation.reviewConversation in delivery mode. A uniquely accepted original envelope is channelAccepted and originMatched only when the selected record is retained in this conversation and binds the exact requested provider, revision, action and recipient. Count the matching retained result message, and require exact audience for recipient resolution and membership. A committed result with matching cache readback is delivered and replayMeaningMatches. A preliminary receipt is pending. A failed result is failed. Do not invent a retry or a delivered result. Return the installed review.
