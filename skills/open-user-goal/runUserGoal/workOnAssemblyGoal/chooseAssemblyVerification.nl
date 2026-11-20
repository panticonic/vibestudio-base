---
description: Decide which selected native builds are necessary, authorized and valid at the current exact source revision.
args:
  goal: string
  inventory: AssemblyInventory
  scope: AssemblyScope
  dependencies: AssemblyDependencies
returns: string[]
---
Use only actual IDs in inventory.allowedBuilds. Build only requested verification targets and prerequisites when the evidence supports them. An undeclared or missing dependency, missing export, disallowed cycle, stale required approval, or a read-only/no-change request is not a reason to build an unrelated candidate. Where authorized and requested, inspect the native build even if the current source may fail to compile. Preserve user-requested order. Do not rerun or substitute a build.
