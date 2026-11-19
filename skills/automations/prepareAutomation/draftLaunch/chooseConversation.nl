---
description: Decide whether a future run needs its current context, a fresh conversation, or a continuity choice from the caller.
args:
  goal: string
  trigger: Trigger
returns: ConversationChoice
readout: decision
---
Honor a request for a new or existing conversation literally. Use continue for short-interval work sharing this context and for an ordinary fixed-text reminder. Use fresh for explicitly separate projects or background topics. Choose clarify when a gap longer than one hour and reliance on this conversation both matter and the user leaves the conversation choice genuinely unclear.
