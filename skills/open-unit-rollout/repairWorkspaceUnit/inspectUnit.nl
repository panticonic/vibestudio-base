---
description: Read current live compiler evidence and the optional complete native check.
args:
  goal: string
  unitId: string
returns: RolloutStage
---
Call unitRolloutObserve.inspect on the selected unit. When its build succeeded, the user wants behavior or release verification, and the unit allows checks, call unitRolloutVerify.check for the exact observed revision. Respect an explicit compiler-only request. A failed build is enough to identify a compiler blocker without running its suite. Return the original observation and actual check or null.
