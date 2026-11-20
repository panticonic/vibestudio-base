---
description: Publish or recover an authorized disposable preview and verify exactly what it serves.
args:
  goal: string
returns: OwnedPreviewReport
uses: [preflightPublication]
budget: { maxTurns: 20 }
---
1. Read ownedPreviewPublication.discover. Call choosePreviewDestination with the user's goal and the actual launch record. Bind its exact destination to the observed revision. If the goal or binding is unresolved, return unresolved.
2. If the binding holds, report its actual hold reason, selected target, and null preflight, receipt and hosted result. Otherwise call preflightPublication with the actual request. If it is blocked, hold with its first blocker as reason and retain the real preflight. Leave receipt and hosted result null.
3. After an exact ready-for-review preflight, call deliverPreview with the bound target and operation ID, the actual preflight, and the user's goal. Return its actual outcome.
