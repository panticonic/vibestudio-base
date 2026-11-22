---
description: Verify the selected attempt against the original authorized terminal and workspace identity.
args:
  assignment: PtyAssignment
  evidence: PtyPair
returns: PtyChoice
---
Use the nominated attempt and its evidence. If there is no nominated evidence and allowAlternative is true, consider the named alternative and its own requested identity. Never replace a visible but wrong attempt.
If no attempt is available return null sessionId and hold-no-session.
Require the exact same context. Otherwise return null sessionId and hold-context.
Require both exact sessionId and PID. Otherwise return null sessionId and hold-generation.
Return the selected sessionId and null blocker.
