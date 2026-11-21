---
description: Resolve the actual current participant required by the user and the selected question.
args:
  goal: string
  question: DurableQuestionJudgment
  roster: DurableQuestionRoster
returns: DurableParticipantJudgment
---
1. Match the requested participant's exact handle or the specific role required by the user and question, using durable handle and participant identity. Similar display names do not establish an exact handle. Preserve the exact member fields for confirmed and inactive results.
2. Use incomplete without a member if the roster read is incomplete or it has unrelated, stale, or partial entries and none proves the required role. Use absent without a member when the roster has no persisted entries. Use inactive when there is one exact historical identity but it left and no current match exists. Use ambiguous without a member if multiple current identities meet the required role and the evidence cannot distinguish them.
3. Use confirmed only when one current, exact identity satisfies the requirement. Do not count a departed row as an additional current candidate. A roster finding alone cannot make a withdrawn, settled, or absent question actionable.
