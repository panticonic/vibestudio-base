---
description: Select any remaining owned packages needed to evaluate the exact observed source imports.
args:
  goal: string
  inventory: AssemblyInventory
  scope: AssemblyScope
  sources: UnitSource[]
returns: string[]
---
Compare the observed import paths and manifest package names with the real inventory. Select unread owned dependencies needed to resolve the goal. Select the currently justified next source scope; the caller can invoke this analysis again after new imports or manifest evidence are observed. Do not read unrelated units merely to fit a fixed follow-up count. Omit unrelated packages and return an empty list when the inputs are complete.
