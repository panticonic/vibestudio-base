---
description: Review the assigned live panel and verify whether a later observation establishes recovery.
args:
  request: PanelHealthRequest
returns: PanelHealthReport
---
1. Call panelHealth.observe, then assessObservation with the expectation and that exact observation.
2. If the caller requested a later read, call checkHealthChange with the original observation, assessment and expectation. Return its result unchanged.
3. Otherwise return the initial assessment, null later, and the initial assessment state as outcome.
