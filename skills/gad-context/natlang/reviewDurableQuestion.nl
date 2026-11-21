---
description: Review an individual durable question and its current participant in the assigned conversation.
args:
  goal: string
returns: DurableQuestionReport
budget: { maxTurns: 11 }
---
1. Call reviewQuestion with the original goal. Keep its exact history receipt, channel and question judgment.
2. Call reviewParticipant with the original goal, the history receipt, and the exact question judgment. Keep its roster receipt and participant judgment.
3. Mark ready only when the question is current and the requested participant identity is confirmed. Otherwise hold. Explain which exact evidence established the current question and participant or which boundary keeps the handoff on hold. Return the original receipts, channel, and judgments. This is a private read-only review.
