---
description: Establish the participant condition from the actual roster for an already observed conversation history.
args:
  goal: string
  question: DurableQuestionJudgment
  historyReceipt: string
returns: DurableParticipantReview
---
Return the actual roster and its participant judgment for the requirement in the supplied goal and question. Use the native roster reader with the actual history receipt, and evaluate the persisted identities and current join/leave state. Preserve the exact roster and judgment; never replace an incomplete, inactive or ambiguous result with an invented confirmed or absent identity. This computation establishes membership and does not send or stage a handoff.
