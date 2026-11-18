---
description: Check that a trusted operation schema and exact host audience match are available.
args:
  observation: IntegrationReceipt
returns: ResearchDisposition | null
---
Use document-endpoint if documented is false. Otherwise use wrong-audience if matchedAudience is false. Return null in all other cases. A missing credential inventory is not proof of an audience mismatch.
