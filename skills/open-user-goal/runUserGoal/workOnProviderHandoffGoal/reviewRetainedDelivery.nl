---
description: Assess whether the selected original delivery is substantiated by its actual retained envelope and readback.
args:
  goal: string
  card: ConversationCard
  current: ConversationRead
  selection: ResultSelection
  output: 'OutputReadback | null'
returns: DeliveryReviewEvidence
---
1. Build a delivery request with the goal and selected channel. Set channelAccepted and originMatched when exactly one original result envelope has the selected message ID in this conversation and binds the exact request ID, provider, revision, operation and audience. Set durableCount to that matching count and set recipientsResolved and membershipVerified to true for the matching retained audience.
2. Set replayMeaningMatches when the exact result is committed and the cache readback matches. In that case settlement is delivered. Use failed for an exact failed result, otherwise pending. Set accountedRetry to false.
3. Call conversation.reviewConversation. Return the exact request and its unchanged report as result.
