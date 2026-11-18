---
description: Reconcile the resumed app, exact PTY attach, and durable state readbacks.
args:
  input: TerminalAppEvidence
returns: DeviceTerminalReview
---
1. For a stopped matched session, failed or nonzero exit is attention / app-exit-needs-restart. Otherwise return waiting / app-stopped. Cite session receipt.
2. Running without a PTY, or without attach evidence, is waiting / app-attach-unobserved with session receipt ID.
3. A different attached session or attached PTY is blocked / app-attach-mismatch with session receipt then attach observation.
4. Same live previousPty and attachedPty means ready / existing-pty-reattached. A new PTY with both state revisions supplied and resumedStateRev at least previousStateRev means ready / app-state-preserved. Otherwise return attention / app-state-unproved. For these matching cases cite observation ID.
