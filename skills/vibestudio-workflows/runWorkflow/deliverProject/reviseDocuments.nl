---
description: Revise the existing project documents to resolve specific review findings.
args:
  request: ContentRequest
  plan: Plan
  documents: Draft[]
  review: ContentReview
returns: Draft[]
---
1. Read the actual planned Markdown pages in documents. Identify the precise text change required for each unsupported claim or blocker using the original facts and the named review evidence.
2. Keep each already satisfied role, factual statement, citation and link. Apply the justified changes to the full Markdown text. Keep the actual planned paths. Use the exact named objects, conditions and values the supplied facts establish.
3. Return the complete revised Markdown document set. If the missing evidence makes a repair unjustified, return an empty array. The caller owns reapplying and rereading the candidate.
