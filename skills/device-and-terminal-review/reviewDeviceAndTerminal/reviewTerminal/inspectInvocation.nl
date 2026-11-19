---
description: Check the operation and context, approval status, and observed invocation mode.
args:
  input: TerminalOperationEvidence
returns: DeviceTerminalReview | null
---
No invocation is waiting / invocation-unobserved with target ID. Another operation or context is blocked / invocation-target-mismatch with target then invocation receipt. Matching denied is blocked / admission-denied; pending is waiting / approval-pending. Only admitted continues to mode check. A filesystem-only task should use scoped filesystem; an ordinary process should use argv; intentional shell composition should use shell mode. A disagreement is attention / execution-mode-mismatch. Cite invocation ID for admission and mode findings. A matching scoped filesystem invocation is ready / scoped-filesystem-admitted, with invocation ID. A matching process proceeds.
