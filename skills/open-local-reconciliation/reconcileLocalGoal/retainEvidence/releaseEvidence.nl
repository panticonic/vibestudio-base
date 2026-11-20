---
description: Request an exact source-and-question assignment for the verified local revision.
args:
  head: string
returns: EvidenceRequest | null
---
Call services.reconciliationWindow.release with the exact reviewed head. Return its actual request or null.
