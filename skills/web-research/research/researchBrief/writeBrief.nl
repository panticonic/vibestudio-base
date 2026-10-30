---
description: Answer a question in a few sentences using only the verified claims given.
args:
  question: string
  claims: Claim[]
returns: Statement[]
---
Answer question with 1 to 4 statements, built only from claims:
1. Each statement is one plain sentence that restates what one or more claims say.
2. In cites, put the id of every claim the statement rests on. Every statement cites at least one id.
3. Say nothing that no claim says. When claims is empty, return an empty list.
