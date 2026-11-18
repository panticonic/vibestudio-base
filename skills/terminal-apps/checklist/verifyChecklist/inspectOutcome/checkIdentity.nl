---
description: Check that the screen sequence preserves the assigned terminal session identity.
args:
  request: ChecklistRequest
  screens: ChecklistScreen[]
returns: boolean
---
Require one initial screen, one per assigned key, and one more only for continuation. All must have the initial sessionId. Every screen through the final toggle has the initial ptyId. The continuation screen retains the PTY on reattach and must have a different PTY on restart.
