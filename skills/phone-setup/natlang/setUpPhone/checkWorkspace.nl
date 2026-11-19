---
description: Read the paired device workspace and report whether it is ready.
args:
  pairingReceipt: string
returns: WorkspaceCheck
---
Call observeWorkspace with the pairing receipt and interpretReadiness with its result. Return the resulting status and exactly the observation receipt.
