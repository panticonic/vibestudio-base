---
description: Establish the current question from the actual durable conversation history.
args:
  goal: string
returns: DurableQuestionReview
---
Return the actual history together with its question judgment for the supplied goal. Obtain the durable history through the available native reader and interpret its exact ordered messages. Preserve the full native history and the selected question judgment, including incompleteness or absence. Do not infer or acquire participant membership in this computation.
