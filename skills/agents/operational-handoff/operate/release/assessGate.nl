---
description: Judge release readiness from explicit gate evidence.
args:
 goal: string
 gates: Gate[]
returns: Assessment
---
Read goal and every supplied gate. Return role release and all supplied gate ids as evidenceIds. Decision is ready only when gates is nonempty and every gate is approved; pending, rejected, or missing gate evidence means blocked. Explain the exact unresolved gate in reason, or the explicit approvals that support readiness. Never upgrade a pending gate because the goal asks to release.

