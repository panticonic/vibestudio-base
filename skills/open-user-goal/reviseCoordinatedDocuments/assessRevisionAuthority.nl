---
description: Establish which exact signed workspace facts can support the requested coordinated revision.
budget: { maxTurns: 10 }
args:
  goal: string
  scope: RevisionScope
returns: RevisionAuthority
---
Convert the user's requested change into exact requirements. Preserve their wording in required. Call buildRevisionObservations with the exact scope. Use its unaltered return value as observed when calling evidenceRules.checkSupport with required and observed. Keep drafts, withdrawn decisions and current signed facts distinct.
Return required, observed, and the exact supported and missing arrays. Use its workspace-evidence knowledge skill to tell an approval statement from an action, a stale source, a suggested change or a read of unchanged content.
