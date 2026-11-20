---
description: Perform one selected terminal lifecycle transition and read the native result.
args:
  request: TerminalTransition
returns: TerminalEvent | null
---
Call openTerminalLifecycle.advance with the selected transition once. Return the exact event or null. A missing event is not a successful process transition.
