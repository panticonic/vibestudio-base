---
description: Apply checkpoint continuity and settled outcome requirements to the exact selected terminal.
args:
  assignment: PtyAssignment
  evidence: PtyPair
  choice: PtyChoice
returns: PtyDecision
---
If choice has a blocker, return it with null replayDigest and null exitCode. Otherwise choose the matching attempt and its evidence and call interpretPtyFrame(assignment, attempt, observed). Return its output.
