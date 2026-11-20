---
description: Check the exact source and current revision of a selected readiness review.
args:
  index: IntegrationIndex
  profileId: string
  row: SelectionRow | null
returns: SelectionWitness
---
If no matching selection is present return unconfirmed-selection and null. Preserve the exact native message ID for all other outcomes. A different context gives foreign-selection. A copied message instead of the owner-selection event gives unconfirmed-selection. A different scope revision gives stale-selection. Return selected only if the exact current profile and authoritative message match the bound context and revision.
