---
description: Determine whether stale or missing delivery evidence calls for another owned read.
args:
  goal: string
  conversations: LocalConversation[]
  observations: LocalObservation[]
returns: ConversationChoice | null
---
1. Inspect whether the retained result covers the named operation, destination and recipient. A receipt for another revision, room or recipient is evidence about that earlier delivery only.
2. Return a still-unread conversation when the goal needs a comparison or an explicit fallback. If it is the room where the user wants a local follow-up, include the exact requested recipient phrase. For a read-only comparison use null.
3. Return null when the needed evidence has been checked or the caller did not authorize another avenue. An ambiguous current audience stays unresolved unless the user supplied a distinguishing recipient constraint.
