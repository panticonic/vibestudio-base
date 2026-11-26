---
description: Choose the representation that serves this reader's actual decision.
args:
  goal: string
  record: AudienceRecord
returns: AudienceChoice
budget: { maxTurns: 10 }
---
Use plain for a single known fact, an explicitly text-only or accessibility constraint, missing data, a fixed computation, or a settled decision that has no useful control. A list or numeric record alone does not justify a panel.
Use catalog when independent alternatives, a time pattern, an actionable checklist, or an actual choice becomes clearer with a grounded built-in component. Use calculator when the reader wants to vary a quantified input and see what changes, and the current record supplies a complete bounded cost model. Never create controls for values that cannot be verified. Give a concise reason tied to the audience and decision.
