---
description: Inspect retained and current layout evidence for this desk.
args:
  desk: DesktopDesk
returns: DesktopWindowObservation
---
Call readDesktopWindow for the desk's exact ID. Preserve current responsive residency independently of logical position or whether the saved pane was pruned. Return its actual evidence.
