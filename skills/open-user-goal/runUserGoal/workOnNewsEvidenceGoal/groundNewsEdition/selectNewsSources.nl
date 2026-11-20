---
description: Identify the bounded article receipts for the exact topic and same reader.
args:
  topic: string
  index: NewsEvidenceIndex
  current: NewsEvidenceSnapshot
returns: NewsEvidenceRow[]
---
Keep article rows with exactly the chosen topic, context and reader, in the current frontier's original order. Keep primary, secondary, listing, and syndicated receipts for evidence comparison. Preserve distinct receipt IDs even when their canonical URL is the same. Foreign rows cannot justify a same-title claim.
