---
description: Judge safe continuation using exact ownership, revision and native action evidence.
args:
  assignment: ActionAssignment
  evidence: AttemptPair
returns: ContinuationFinding
budget: { maxTurns: 17 }
---
1. A different notebook on the approval means hold-ownership. An older approved revision or a notebook that advanced after the admitted action means hold-revision. Apply these before treating a visible console or saved value as current.
2. If the retained event evidence is incomplete, use recover-native-evidence. An audit can report a saved value as recover-existing-value, a cancelled action as hold-cancellation, or a proved missing effect as report-no-effect.
3. For a follow-up request without an exact action grant, return inspect-only. After cancellation return hold-cancellation. If a saved effect already exists, choose confirm-continuation for an approved continuation and recover-existing-value for a retry request. Never duplicate that effect.
4. Without a saved effect, exactRetry from the native evidence and an approved retry are both required. Ready prerequisite yields retry-exact-step. An unmet prerequisite yields hold-prerequisite. Other failures yield report-no-effect.
5. Give a brief reason grounded in the original terminal result, captured output or scoped value and the present revision.
