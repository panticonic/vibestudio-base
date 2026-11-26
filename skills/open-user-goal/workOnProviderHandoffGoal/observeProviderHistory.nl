---
description: Obtain the retained observations needed to answer this provider request without inferring consent from a queue.
args:
  goal: string
  card: ConversationCard
  read: '(channelId: string) => ConversationRead | null'
returns: 'ProviderHistory | null'
---
Read the actual selected owned conversation. Return null when it is unavailable. Establish the current retained evidence needed for the user's question and any comparison they requested. When judging a changing request, refresh the observation and preserve the earlier view needed to explain the change. Additional reads may confirm the same frontier; repeated observations are not additional authority. For an unchanged conversation, the same actual observation can support both opening and current. Return the actual observations as opening and current; never fabricate a transition or a missing host decision.
