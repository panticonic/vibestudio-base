---
description: Identify evidence and render an exact, portable handoff only when every question is supported.
args:
  request: HandoffRequest
  observed: SourceRead[]
returns: PreparedHandoff
uses: [handoffChecks]
---
Call selectEvidence(request, observed). Give its locations, request.questions and observed to handoffChecks.prepare. Return the exact preparation result.
