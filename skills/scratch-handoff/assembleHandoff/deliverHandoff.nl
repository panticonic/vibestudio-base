---
description: Stage the prepared handoff and report only the observed write outcome.
args:
  body: string
returns: HandoffReport
---
Call commitHandoff(body) once. If it returns a receipt, return staged with that artifact. Otherwise return unverified with artifact null. Both missingSources and unanswered are empty because preparation succeeded.
