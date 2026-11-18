---
description: Review app-source and session matching before interpreting PTY continuity or host-owned approval.
args:
  input: TerminalAppEvidence
returns: DeviceTerminalReview
---
1. Call identifySession. Return any scope finding.
2. For continuity call reviewContinuity. For approval call reviewAppApproval.
