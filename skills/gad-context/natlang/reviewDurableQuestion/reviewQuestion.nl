---
description: Observe durable conversation history and identify the individual user question relevant to the current handoff.
args:
  goal: string
returns: { historyReceipt: string; channelId: string; question: DurableQuestionJudgment }
---
Call readMessages, then call interpretQuestion with the original goal and exact history. Return the history receipt and channel, and the exact interpretation.
