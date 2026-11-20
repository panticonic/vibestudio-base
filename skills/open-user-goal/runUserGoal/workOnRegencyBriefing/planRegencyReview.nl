---
description: Translate the player's open council objective into explicit accounts, horizons and local authority.
args:
  goal: string
  index: RegencyIndex
  opening: RegencySnapshot
  current: RegencySnapshot
returns: RegencyPlan
---
1. Read the original retained memo when the user refers to its wording or proposals. Its basis identifies the saved receipt it used. Compare that with current.revision to detect a stale memo. Infer the named evaluation claims in request order using exact observed route or region IDs. Use opening for the first saved receipt, current for the second, and a numeric horizon for a projection measured from the second. When a proposed statement treats a projection as committed, preserve that assertion for review.
2. Request just the needed forecast horizons in request order. Omit unsupported horizons rather than silently shortening a requested period. A pending narration can coexist with a settled ledger. Review it without allowing another command to take it over.
3. Set localNote only for an explicitly private note. Set advance only to the explicitly authorized duration. Record the minimum acceptable treasury if requested. A projection request cannot authorize committed time. Use null for unspecified authority or minimum.
