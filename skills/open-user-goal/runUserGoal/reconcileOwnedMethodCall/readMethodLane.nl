---
description: Resolve the current owned local method lane and read its exact provider and terminal evidence.
args:
  goal: string
returns: { card: LocalMethodCard; evidence: LocalMethodEvidence }
---
Call findOwnedMethodCard with the exact goal. Call inspectOwnedMethodLane with the selected card id. Return their actual results.
