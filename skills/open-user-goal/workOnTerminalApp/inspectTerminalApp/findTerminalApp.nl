---
description: Resolve the user's terminal app among the current and retired owned assignments.
args:
  goal: string
returns: TerminalRepairApp
---
Call terminalRepairCatalog.list(). Select the current owned app matching the user goal. Keep its canonical path and exact authority fields.
