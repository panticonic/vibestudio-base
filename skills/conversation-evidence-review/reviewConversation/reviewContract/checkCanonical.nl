---
description: Check the actual protocol schema, canonical hash and encoded payload details.
args:
  request: ContractInput
returns: string[]
---
Append schema if validation fails. Append hash if the canonical hash differs. Append terminal-kind if the stored terminal event and outcome disagree. Append projection if private participant data exceeds the authorized projection. Append stored-value if an oversized payload was inlined. Append failure-envelope if a failure lacks the structured typed form. Return the missing requirements in that order.
