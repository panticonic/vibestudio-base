---
description: Select any remaining owned packages needed to evaluate the exact observed source imports.
args:
  goal: string
  inventory: AssemblyInventory
  scope: AssemblyScope
  sources: UnitSource[]
returns: string[]
---
Compare the observed import paths and manifest package names with the real inventory. Select unread owned dependencies needed to resolve the goal. When a transitive package might refer to another unread unit, include enough of the small owned inventory to resolve it in this one follow-up. Omit unrelated packages and return an empty list when the inputs are complete.
