---
description: Interpret the matched bounded shell result, including timeout and truncated output.
args:
  input: TerminalOperationEvidence
returns: DeviceTerminalReview
---
No result is waiting / execution-result-unobserved with invocation ID. A result for another context or operation is blocked / result-target-mismatch with target then result receipt. For matching result, use this priority: timedOut is attention / execution-timed-out; no exitCode is attention / exit-unconfirmed; nonzero exit is attention / execution-failed; zero with truncated output is attention / success-output-truncated; zero with complete output is ready / execution-succeeded. Cite result receipt. Presence of stderr alone does not change an observed zero exit.
