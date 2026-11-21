---
description: Identify the latest actual individual user question and determine whether it still calls for action.
args:
  goal: string
  history: DurableQuestionHistory
returns: DurableQuestionJudgment
---
1. If the history is incomplete, return history-incomplete with no message.
2. Examine the ordered messages and each separate message's exact blocks. Work backward through user messages. Identify the most recent genuine user question, considering the handoff topic in the goal. Quoted questions and rhetorical mentions of earlier questions do not become new requests. Interpret an unpunctuated direct request by its meaning. Keep one whole message exactly including its identifiers, role, sequence and blocks. Never fuse separate native messages.
3. If no user question exists, use no-question and no message. If a later user message explicitly withdrew or replaced the relevant question with a cancellation, keep its exact row and use withdrawn. If a later message explicitly settles the question, keep its exact row and use settled. An ordinary status update, a quotation, or an offer to respond later leaves it current. An actual newer question takes precedence over the older question. Keep the observed row and report current when it still calls for a response.
