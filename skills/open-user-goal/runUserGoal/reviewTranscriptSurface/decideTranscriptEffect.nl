---
description: Decide the smallest effect needed for the approved transcript surface.
args:
  assignment: SurfaceAssignment
  selection: SurfaceSelection
  replay: "SurfaceReplay | null"
returns: SurfaceDecision
---
1. If selection has a blocker, return none with that reason.
2. An inline approval is already current if the exact stable card exists and its title, detail and status match. Otherwise publish-inline when absent, or refresh-inline under the stable key when present.
3. A bar approval is already current if the exact approved key and all card fields match an active bar. Otherwise display-bar.
4. A clear approval is already current when the bar is absent or cleared. Otherwise clear-bar and preserve inline cards.
Use reason already-current for no effect after replay, and ready for a real effect.
