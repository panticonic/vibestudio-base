---
description: Commit the verified exact local draft when its working basis still matches.
args:
  id: string
  basis: DeliveryState
returns: LocalDeliveryReceipt | null
---
Return branchDeliveryWrite.commit(id, basis).
