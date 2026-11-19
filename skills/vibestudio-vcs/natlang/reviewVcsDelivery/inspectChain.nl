---
description: Interpret the local chain and the protected-main relationship independently.
args:
  snapshot: VcsDeliverySnapshot
returns: VcsDeliveryChain
---
Call describeLocalChain with the clean flag and file.hasLocalDifference. Call reviewIntegration with the relation and integrations. Return both decisions as local and main.
