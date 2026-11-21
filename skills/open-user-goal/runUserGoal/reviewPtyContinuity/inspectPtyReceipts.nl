---
description: Read separate native retained output for the two addressed terminal attempts.
args:
  assignment: PtyAssignment
returns: PtyPair
---
Call readPtyAttempt with assignment.nominated and again with assignment.alternative. Return the exact two answers as nominated and alternative.
