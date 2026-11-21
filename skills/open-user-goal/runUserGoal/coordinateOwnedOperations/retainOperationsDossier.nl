---
description: Retain a private readiness record for the exact authorized release assessment.
args:
  docket: OperationsDocket
  operation: OperationsReport
returns: OperationsDossier
---
Use operationsDossier.retain with the exact current docket id and revision and the actual release operation. Return its receipt unchanged.
