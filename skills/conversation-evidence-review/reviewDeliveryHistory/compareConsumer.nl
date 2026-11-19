---
description: Compare durable meaning with what the assigned consumer displayed.
args:
  retained: DurableDeliveryRow
  rendered: DeliveryMessage[]
returns: DeliveryConsumer
---
For no rendered rows, return missing. For more than one rendered row, return divergent. For exactly one, call sameMessage with the retained message and rendered message. Return matched when the comparison succeeds and divergent otherwise.
