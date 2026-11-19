---
description: Decide what can follow from the completed eval and observed effect.
args:
  attempt: EvalRecoveryAttempt
  finding: EvalRecoveryJournalFinding
  effect: EvalRecoveryEffect
returns: {next: EvalRecoveryNext, reason: string}
---
1. For a mismatch, missing readback, or different readback, use inspect-integrity. Explain the discrepancy.
2. For an incomplete journal, use recover-journal. For an absent operation in a complete journal, use inspect-original-attempt.
3. For a matched operation with an unchecked effect, use confirm-effect. For a confirmed effect, use continue-with-effect and preserve the cell outcome independently.
4. Give a brief reason. Recommend read-only confirmation before deciding whether any further mutation is needed.
