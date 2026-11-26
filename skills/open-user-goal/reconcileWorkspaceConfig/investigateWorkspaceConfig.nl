---
description: Produce actual scoped workspace-config evidence for the outer coordinator.
args:
  goal: string
returns: ConfigInquiry
uses: [reconcileWorkspaceConfig/settings/readConfigBrief, reconcileWorkspaceConfig/selectConfigLens, reconcileWorkspaceConfig/collectConfigEvidence, reconcileWorkspaceConfig/reviewConfigDisposition]
---
Choose the relevant current configuration questions from the goal and actual brief. Acquire the active configuration and only the source/history/dependency observations needed for that scope. The existing typed collector preserves native identities and basis relationships; semantic selection and interpretation remain yours.

Distinguish absent declarations, different epochs, working-only changes and actual running values. Return the real brief, lens, evidence and semantic outcome, using null when owned evidence is unavailable. Do not retain a record or imply an unperformed source read or configuration change.
