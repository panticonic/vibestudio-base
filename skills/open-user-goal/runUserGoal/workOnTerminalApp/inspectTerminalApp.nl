---
description: Select the current assigned terminal app and inspect its exact source and native regression evidence.
args:
  goal: string
returns: {app: TerminalRepairApp; check: TerminalRepairCheck}
---
Call findTerminalApp with the goal, then call observeTerminalApp with the selected exact app ID. Keep the actual results.
