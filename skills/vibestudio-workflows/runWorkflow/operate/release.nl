---
description: Persist a release checkpoint, restart that same owned worker and continue from its retained state using new gate evidence.
args:
 goal: string
 before: OperationsGate[]
 after: OperationsGate[]
returns: '{ handoff: OperationsHandoff; handles: OperationsOwnedHandle[] }'
---
1. Open one ownedOperations worker for role release. Call assessGate(goal, before). Persist its assessment with append(handle, 0, assessment).
2. Call ownedOperations.restart on that exact handle. The result is a fresh read from the actual worker after its owning driver restarts. Require the observed revision and retained first checkpoint to match the actual append result. If they do not, propagate the continuity failure instead of reconstructing a checkpoint.
3. Call assessGate(goal, after). Append that new assessment at the revision reread after restart, then independently read the same handle again. Require two retained checkpoints with the new assessment at the later revision.
4. Call handoff(goal, reread checkpoints). Return that Handoff and the exact handle. The parent owns cleanup.

