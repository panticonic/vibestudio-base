---
name: open-session-recovery
description: Recover the current state of work from retained conversations and stage an authorized handoff.
---

Call `recoverSessionGoal` with the user's goal. Discover available conversations
and choose which sources are relevant. Read their retained windows through the
cursor binding, then resolve the disposition from the authoritative messages.

An incomplete window leaves later outcomes unresolved. If a saved cursor belongs
to another conversation, use the owning conversation when the user authorizes
that read. Stage a handoff only with authorization and observed citations.
