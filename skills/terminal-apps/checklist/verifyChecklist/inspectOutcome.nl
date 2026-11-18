---
description: Verify the session, PTY, and state transitions the screens prove.
args:
  request: ChecklistRequest
  screens: ChecklistScreen[]
returns: "verified" | "mismatch"
---
Call checkIdentity and checkItems with the original request and the exact screens. Return verified only when both confirm the observed sequence. Missing screens or a fabricated continuation are mismatches.
