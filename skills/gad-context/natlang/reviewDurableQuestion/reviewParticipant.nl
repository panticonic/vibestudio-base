---
description: Verify a current participant for the user's question using the separate persisted roster.
args:
  goal: string
  historyReceipt: string
  question: DurableQuestionJudgment
returns: { rosterReceipt: string; participant: DurableParticipantJudgment }
---
Call readMembers with the exact history receipt. Call evaluateRoster with the original goal, exact question judgment and roster, then return the roster's exact receipt and that participant judgment.
