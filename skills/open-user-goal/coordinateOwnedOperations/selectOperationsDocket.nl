---
description: Match an operational concern to a unique current owned docket and obtain its bounded local evidence.
args:
  goal: string
returns: OperationsDocketEvidence | null
---
1. Call operationsDocket.list. Match the user's named concern and purpose to the title and operation kind. Consider only current editions. If no unique current edition matches, return null.
2. Call operationsDocket.read using that exact docket id and revision. Require the returned docket identity and revision to equal the selection. Return its authority, rationale and actual request evidence unchanged.
