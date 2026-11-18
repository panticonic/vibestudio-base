---
description: Review persisted causal identity and equivalent replay meaning.
args:
  request: DeliveryInput
returns: string[]
---
Append accepted when the channel did not accept the row. Then append origin when the recorded source coordinates do not join. Append durable-count when there is not exactly one persisted row. Append replay when replay and live records differ in meaning. Ignore delivery-only presentation phase differences. Return in this order.
