---
description: Persist the requested next-step handoff only in this owned local case.
args:
  audience: string
  decision: ClientDecision
returns: 'ClientHandoff | null'
---
Call clientDiagnostics.stage with the exact audience and actual decision. Keep the exact returned receipt, or leave the handoff null on a hold.
