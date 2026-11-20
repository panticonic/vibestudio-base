---
description: Inspect the host's retained desktop update evidence and current visible notices.
args:
  desk: DesktopDesk
returns: DesktopUpdateObservation
---
Call readDesktopOffers with the actual desk ID. Return the actual evidence. A running build, a catalog build and a retained offered build can be different.
