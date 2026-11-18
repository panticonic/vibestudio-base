---
description: Check schema, retained history and exact consumer readbacks for a canonical protocol change.
args:
  request: ContractInput
returns: ConversationReport
---
Call checkCanonical and checkConsumers. Combine their blockers in that order. Return kind contract, the exact revision as basis, and ready when no blocker remains. A retained failure or cancellation must keep its exact event identity.
