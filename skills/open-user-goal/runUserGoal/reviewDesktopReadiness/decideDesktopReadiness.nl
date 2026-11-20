---
description: Ground a safe next desktop action in retained client and window evidence.
args:
  goal: string
  evidence: DesktopReadinessEvidence
returns: DesktopReadinessDecision
budget: { maxTurns: 14 }
---
1. Give priority to the user's exact scope and any action conditions. If the persisted window belongs to another workspace or a replacement owner, choose hold-scope. If an admission or authority prerequisite for the action is unconfirmed, choose wait-for-admission.
2. For a placement goal, compare focus, current viewport and retained placement. A valid but parked pane remains available without a rebuild; when the arrangement needs restoration or a reliable layout could not be recovered, choose restore-layout and explain what remains. Identify an invalid snapshot precisely. Do not claim restored document text.
3. For an update goal, compare the offered build, running build, current output, rejection/rollback notices and retained versions. If a ready staged build exists and the user wants a readiness review with no conflicting pending edit, choose review-ready-update. Prefer defer-update if the user's current unpersisted work must stay open. Choose inspect-offer for an incomplete offer identity or a failed candidate that needs investigation. Choose review-rollback only when the user wants an exact prior build and a retained option exists. Keep open when the same build replayed, an unowned or stale offer disappeared, a rollback already finished, or the user asks to preserve already-restored window state.
4. Explain the actual evidence driving the decision, including the current build or pane if relevant. Do not arrange a real restart, apply, rebuild or rollback.
