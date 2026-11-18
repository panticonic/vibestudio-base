---
description: Evaluate a candidate repair against the actual build and complete-runtime test evidence.
args:
  request: Request
  evidence: Evidence
  diagnosis: Diagnosis
  proposal: Proposal
returns: Verification
---
1. Check that evidence.build identifies the assigned unit, exact candidate state and successful status with no error diagnostics. Account for all reported diagnostics.
2. Check evidence.tests for the actual assigned suite and context, the manifest-declared runtime, nonzero executed tests, no failed tests and matching artifact/execution identities. A compilation-failed report gives diagnostics but no executed tests. Return passed:false with that evidence.
3. Relate the observed assertions and preserved contracts to the requested behavior and the diagnosed mechanism. Return passed only when the actual observations support the repair; otherwise retain failures and precise open questions. The caller's independent verifier makes the final admission decision.
