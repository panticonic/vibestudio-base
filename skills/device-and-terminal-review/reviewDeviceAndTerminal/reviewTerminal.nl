---
description: Review operation choice, exact admission and bounded terminal result for one requested workspace action.
args:
  input: TerminalOperationEvidence
returns: DeviceTerminalReview
---
1. Call inspectInvocation. Return any finding before interpreting process output.
2. Call inspectExecution to report the observed result.
