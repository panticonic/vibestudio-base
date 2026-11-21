---
description: Decide which local method request, recovery or hold satisfies the user.
args:
  goal: string
  card: LocalMethodCard
  evidence: LocalMethodEvidence
returns: LocalMethodPlan
---
Call chooseMethodDisposition with evidence. Use card.method exactly. Explain the disposition with respect to the goal. Do not use a stale or unjoined provider, and do not reissue a terminal invocation.
