---
description: Inspect the actual committed local message or unsent outcome.
args:
  receipt: Receipt | null
returns: DeliveryEvidence
---
Call localMessagingRead.inspectDelivery(receipt) and return the original observed evidence unchanged. A null receipt requests inspection of the unsent branch. Do not infer completion from elapsed time or a teacher statement.
