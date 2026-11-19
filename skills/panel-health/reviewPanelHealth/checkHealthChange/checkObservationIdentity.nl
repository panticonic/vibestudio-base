---
description: Check that the refresh observes the assigned panel and a different evidence record.
args:
  first: PanelHealthObservation
  later: PanelHealthObservation
returns: boolean
---
Require the same panel ID, a nonempty later attempt ID and build key, and a different observation ID. Require newer evidence in at least one of these fields: attempt, build, ordered marker values, or consoleThrough. The ID alone is insufficient.
