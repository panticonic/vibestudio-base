---
description: Decide whether the user requested a private handoff of this verified retained provider result.
args:
  goal: string
  card: ConversationCard
returns: boolean
---
Return true only when the user's requested outcome includes a local handoff of this exact retained result, the current card permits staging. A workspace grant alone does not request a new artifact. A read-only review returns false. Never interpret the old provider grant as permission for another provider call or external send.
