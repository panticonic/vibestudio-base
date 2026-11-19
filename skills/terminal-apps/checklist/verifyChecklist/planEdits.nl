---
description: Choose the caller's safe order for applying exactly the checklist changes still needed.
args:
  goal: string
  target: ChecklistTarget
  initial: ItemKey[]
returns: ItemKey[]
uses: [verifyChecklist/targetChecks]
---
Call targetChecks.changes with target and initial. Key 1 is Build prepared, key 2 is Review complete, and key 3 is Rollback confirmed. Use the goal to sequence the needed check and clear operations, respecting explicitly stated prerequisites. If no order is requested, clear superseded checks first and then mark new checks, using ascending item key within each group. Return an empty list when no change is needed.
