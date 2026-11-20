---
description: Find and independently confirm recovery of a requested owned visual surface.
args:
  goal: string
returns: RecoveryReport
budget: { maxTurns: 16 }
---
1. Call panelRecovery.discover and chooseRecoverySurface(goal, actual catalog). Bind the selected surface and catalog revision. When unresolved, explain why.
2. Call recoverSurface with the full goal and the bound owned surface. Return its actual disposition.
