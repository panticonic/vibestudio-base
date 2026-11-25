---
description: Decide which selected native builds are necessary, authorized and valid at the current exact source revision.
args:
  goal: string
  inventory: AssemblyInventory
  scope: AssemblyScope
  dependencies: AssemblyDependencies
returns: string[]
---
Return the ordered build IDs for the caller to verify at the current source head. This function selects values and does not execute builds; the caller owns that operation. A build receipt is not an input prerequisite for selecting a requested, allowed build. Judge availability from inventory.allowedBuilds and actual source/dependency evidence, not from the absence of native service bindings in this pure selector. Use only actual IDs in inventory.allowedBuilds. Select only requested verification targets and prerequisites when the evidence supports them. An undeclared or missing dependency, missing export, disallowed cycle, stale required approval, or a read-only/no-change request is not a reason to build an unrelated candidate. Where authorized and requested, select the native build for inspection even if the current source may fail to compile. Preserve user-requested order. Do not request a duplicate or substitute build; this call chooses IDs and does not run builds.
