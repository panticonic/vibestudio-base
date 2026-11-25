---
description: Decide which selected native builds are necessary, authorized and valid at the current exact source revision.
args:
  goal: string
  inventory: AssemblyInventory
  scope: AssemblyScope
  dependencies: AssemblyDependencies
returns: string[]
---
Return the ordered build IDs for the caller to verify at the current source head. Use only actual IDs in inventory.allowedBuilds. Select only requested verification targets and prerequisites when the evidence supports them. An undeclared or missing dependency, missing export, disallowed cycle, stale required approval, or a read-only/no-change request is not a reason to build an unrelated candidate. Where authorized and requested, select the native build for inspection even if the current source may fail to compile. Preserve user-requested order. Do not request a duplicate or substitute build; this call chooses IDs and does not run builds.
