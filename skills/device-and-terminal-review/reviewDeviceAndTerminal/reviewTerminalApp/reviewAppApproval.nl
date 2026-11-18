---
description: Attribute the app approval and distinguish native host chrome from a panel-drawn prompt.
args:
  input: TerminalAppEvidence
returns: DeviceTerminalReview
---
No approval receipt means waiting / app-approval-unobserved with session receipt ID. Another context or principal is blocked / app-approval-mismatch with app session then approval receipt. For an attributed approval, hostRendered false is blocked / approval-not-host-rendered. A pending visible host approval is waiting / app-approval-pending. A hidden pending host approval is waiting / app-approval-hidden. Granted is ready / app-approval-granted, and denied is blocked / app-approval-denied. Cite the approval ID once attributed. User consent belongs to the host approval surface.
