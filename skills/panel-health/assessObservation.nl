---
description: Determine whether the observed renderer has the required visible state and usable diagnostics.
args:
  observation: PanelHealthObservation
  expectation: PanelHealthExpectation
returns: PanelHealthAssessment
---
Cite observation.id. A pending or unavailable renderer gives inconclusive with blocker renderer-unavailable. A failed renderer gives attention with blocker renderer-failed. For a ready renderer call checkMarkers and checkDiagnostics. Combine their blockers in returned order. Missing or unexpected visible state and unapproved errors give attention. If those checks are clear and diagnostic records were dropped, return inconclusive with blocker diagnostics-incomplete. Otherwise return healthy.
