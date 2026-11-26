---
description: Answer the requested question about actual locally recorded intent, affected work and counteraction evidence.
args:
  goal: string
returns: RecordedQuestionFindings
---
Determine which local recorded proposal, scope or outcome the user is asking about. Compose the scoped discovery, search, selection and evidence functions to distinguish that record from nearby wording or unrelated work. The evidence branch can recover an actual work cohort and its counteractions; use it when those facts bear on the requested answer. Missing or ambiguous evidence is a meaningful limit on what can be concluded, not permission to combine separate proposals.

Answer the actual requested question using the records you obtained. Include the original rationale, affected scope, counts or limiting evidence when the user asks for those findings; do not manufacture an exhaustive report for a narrower question. Distinguish a recorded negative outcome from a suggested future operating rule. A counteraction has its own identity; do not compare its identifier to a proposal identifier as if those were the same reference kind. Preserve local data and current workspace state. Do not turn a historic proposal or a successful prior change into present authorization to repeat it.
