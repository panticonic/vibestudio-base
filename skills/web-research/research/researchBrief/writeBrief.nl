---
description: Answer a question in a few sentences using only the verified claims given.
args:
  question: string
  claims: WebClaim[]
returns: WebStatement[]
---
Answer the factual question with enough concise statements to cover what the verified claims establish:
1. Each statement is one plain sentence supported by one or more claims and their exact quotations. Preserve source attribution and distinctions when the question calls for comparison. The supplied URL/title identify where each claim was read.
2. In cites, put the id of every claim the statement rests on. Every statement cites at least one id.
3. Say nothing the quoted evidence does not support. A source-local claim does not establish what other sources contain or whether they were available. When claims is empty, return an empty list.
