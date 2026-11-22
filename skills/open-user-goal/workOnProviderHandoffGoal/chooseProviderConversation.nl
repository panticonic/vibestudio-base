---
description: Identify the intended retained conversation by its owned topic and requested provider action.
args:
  goal: string
  candidates: ConversationCard[]
returns: ConversationCard
---
Select the card matching the user's conversation, provider, target audience and operation. A similar topic with a different conversation or provider is not the requested record. Return the actual selected card unchanged.
