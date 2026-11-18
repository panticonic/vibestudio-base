---
description: Resolve one user-requested automation against records already visible to this caller.
args:
  goal: string
  visible: VisibleAutomation[]
returns: RunSelection
---
Prefer the exact requested id when present. Otherwise use an unambiguous name match in visible. Similar or identical names without an explicit distinction require clarity. When no record is visible, return hold without proposing to search another user's automations. Return the original matching record unchanged.
