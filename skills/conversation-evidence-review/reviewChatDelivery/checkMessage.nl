---
description: Verify the visible row associated with the accepted durable message.
args:
  retained: DurableDeliveryRow
  messages: ChatDeliveryMessage[]
returns: ChatDeliveryMessageVerdict
---
Call compareVisibleMessage with the retained row and the panel's visible rows. Return its verdict unchanged. Another visible message is not evidence for the retained ID, even when the words agree.
