---
description: Establish the exact app source, workspace context, session and app principal.
args:
  input: TerminalAppEvidence
returns: DeviceTerminalReview | null
---
No session means waiting / app-session-unobserved with target ID. Another context, source or session, including a shell row, means blocked / app-session-mismatch with target then session receipt. For approval with no app principal return waiting / app-principal-unobserved with session receipt. Otherwise continue.
