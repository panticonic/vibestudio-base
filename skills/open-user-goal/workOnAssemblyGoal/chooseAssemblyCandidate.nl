---
description: Identify the owned package intended by the user's operational goal and the bounded sources needed to review it.
args:
  goal: string
  inventory: AssemblyInventory
returns: AssemblyScope
---
Return an AssemblyScope identifying the root and the source IDs for the caller to read. Select the exact runtime or review candidate whose purpose fits the user. Project labels are evidence and an old note cannot authorize an ambiguous choice. Return root null when no unique candidate applies. Include that root and relevant installed candidate dependencies, including needed siblings or alternatives, in inspect. Use only inventory IDs, at most eight. If all actual files may be needed to resolve dependency routes, select the full bounded inventory for one read by the caller.
