---
description: Decide whether the actual private candidate should remain for review, remain a draft or receive the authorized local commit.
args:
  decision: ProjectEvidenceDecision
  scope: ProjectScopeLease
  draft: AuthoredProjectDraft
returns: PrivateProjectFinish
---
Assess the actual candidate and semantic review against the previously chosen, native-admitted action. A missing draft or unresolved review cannot be called complete. Preserve the actual candidate when it exists, explaining its state with the typed finish value. A requested working draft stays uncommitted.

Only an admitted local-commit action with a ready actual review may reach the exact commit boundary. Interpret the boundary's real event or refusal: a refused current-head commit does not create an event or discard the retained candidate. Return the actual candidate and event with an accurate disposition. This computation grants no new scope and cannot substitute a fabricated review, source receipt, snapshot or head.
