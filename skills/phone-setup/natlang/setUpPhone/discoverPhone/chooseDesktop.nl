---
description: Determine which desktop the assignment permits preparing.
args:
  assignment: SetupStart
returns: string | null
---
If providerId is assigned, return it only if present in desktops. If providerId is absent, return a providerId only when desktops contains exactly one entry. Otherwise return null.
