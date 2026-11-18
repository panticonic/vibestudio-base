---
description: Distinguish verified membership, exact addressing, actual settlement and accounted retry.
args:
  request: DeliveryInput
returns: string[]
---
Append membership for missing verified roster state, even when a live socket exists. Append addressing for unresolved or ambiguous recipients. Append settlement if delivery is pending or failed. If delivery failed and its retry is not accounted for, append outbox. Return in this order. An accepted log row survives a failure.
