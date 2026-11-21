---
description: Retain exact reviewed output metadata in the assigned local scratch.
args:
  observed: PtyObservation
  decision: PtyDecision
returns: PtyReceipt
---
Return ptyContinuityHandoff.stage(observed.sessionId, observed.replayDigest, decision.disposition) verbatim.
