---
description: Read the actual current roster and retained local delivery receipts for the chosen conversation.
args:
  choice: ConversationChoice
returns: LocalObservation
---
Call localDeliveryHistory.inspect with the exact roomId and recipientPhrase from choice. Return the original observation.
