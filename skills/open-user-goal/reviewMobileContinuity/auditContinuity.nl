---
description: Run the four independent checks on the selected owned mobile record.
args:
  id: string
returns: MobileContinuityEvidence
budget: { maxTurns: 14 }
---
Call readBuild, readCache, readTransport and readRoutes with the exact profile ID. Return the four results unchanged. Build evidence gives the actual declaration, ABI and grants. Cache gives local startup identity. Transport shows actual session behavior under the fixture. Routes distinguish a retained owned session, a slot with no lease, and a foreign or invalidated lease.
