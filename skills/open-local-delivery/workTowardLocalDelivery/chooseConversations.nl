---
description: Find the named current conversations and retained evidence relevant to the requested audience.
args:
  goal: string
  conversations: LocalConversation[]
returns: ConversationChoice[]
---
1. Choose the owned room or rooms that the user asks to check. A requested comparison includes each named lane. Honor a condition to try a particular room before reading a fallback. When a send depends on approval from a separate room, start with the approval room unless the goal separately requests a current-room audit.
2. In the room where the user wants to address a note, set recipientPhrase to the actual name, role phrase, or exact @handle from the request. Set it to null in history-only rooms. Keep names from the body separate from the intended recipient.
3. Omit rooms that merely have a similar title or belong to an unrelated operation. If nothing matches, return an empty list.
