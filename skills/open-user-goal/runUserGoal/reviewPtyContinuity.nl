---
description: Reconcile retained output from an interrupted terminal and optionally keep exact local evidence.
args:
  goal: string
returns: PtyContinuityOutcome
budget: { maxTurns: 30 }
---
1. Call discoverPtyReview for the requested current assignment. Keep the user's goal unchanged.
2. Call inspectPtyReceipts to read the requested and alternate terminal attempts.
3. Call choosePtyGeneration with assignment and evidence.
4. Call judgePtyContinuity with assignment, evidence and choice.
5. Only for stage-good, call stagePtyReceipt with the exact chosen observation and decision. Otherwise set receipt to null.
Return the five exact values as assignment, evidence, choice, decision and receipt.
