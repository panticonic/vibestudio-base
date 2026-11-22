---
description: Determine the exact card content needed for the migration request.
args:
  goal: string
  view: MigrationView
  basis: MigrationBasis
returns: MigrationSelection | null
---
Select the cards, target and exclusions that satisfy the original goal. Use the rendered list, stable card IDs and archive flags. Do not silently replace a missing requested card with a different one. Keep each selected card intact, including its summary, checklist and attachment references. Preserve observed source order. The approved scope is a ceiling for writing and may differ from the inventory the user requests. This function does not change state. Return null if the requested scope cannot be determined.
