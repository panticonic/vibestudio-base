---
description: Assess the current attempt against the user's exact acceptance conditions.
args:
  goal: string
  pair: CloseoutPair
  current: CloseoutEvidence
  prior: CloseoutEvidence | null
returns: CloseoutDecision
---
1. Preserve exact current remaining IDs. Any resource still present means hold-residue regardless of a passing test or previous cleanup.
2. When the user requires a successful run and the current attempt was not passed, use hold-test. A user can explicitly accept a failed assertion for cleanup-only review.
3. When the user requires clean callback receipts and the current deferred release is not confirmed, use hold-ack even if actual inventory is clear. If they ask for inventory-only clearance and inventory is clear, a callback error alone need not stop clearance.
4. Otherwise use cleared. Explain a relevant difference from the prior attempt when it was actually acquired. Null prior means it was not inspected, not that it passed or has no residue. Set note only for a requested private record under the user's conditions, including a hold only when they asked to record holds.
