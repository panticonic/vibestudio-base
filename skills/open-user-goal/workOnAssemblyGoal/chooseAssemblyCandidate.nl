---
description: Identify the owned package intended by the user's operational goal and the bounded sources needed to review it.
args:
  goal: string
  inventory: AssemblyInventory
returns: AssemblyScope
---
Select the exact runtime or review candidate whose purpose fits the user. Project labels are evidence and an old note cannot authorize an ambiguous choice. Return root null when no unique candidate applies. Inspect that root and relevant installed candidate dependencies, including needed siblings or alternatives. Use only inventory IDs, at most eight. If all actual files may be needed to resolve dependency routes, inspect the full bounded inventory once.
