---
description: Verify a later renderer observation and distinguish a confirmed recovery from a new failure.
args:
  first: PanelHealthObservation
  initial: PanelHealthAssessment
  expectation: PanelHealthExpectation
returns: PanelHealthReport
uses: [reviewPanelHealth/assessObservation]
---
1. Call panelHealth.observeAfter(first.id). Call checkObservationIdentity with both observations.
2. If identity fails, return initial and a later inconclusive assessment citing the later observation with blocker observation-mismatch, and outcome inconclusive.
3. Call assessObservation on the later observation. A later healthy result following initial attention gives recovered. In other cases use the later assessment state as outcome. Return both assessments.
