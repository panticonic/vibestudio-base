---
description: Match the receipt's causal message and sender to the retained envelope.
args:
  receipt: DeliveryReceipt
  row: DurableDeliveryRow
returns: DeliveryOrigin
---
If both messageId and senderId agree and the row has a nonempty envelopeId and a positive sequence, return matched. Otherwise return receipt-mismatch.
