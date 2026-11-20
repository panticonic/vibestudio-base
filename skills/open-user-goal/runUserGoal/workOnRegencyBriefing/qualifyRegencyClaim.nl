---
description: Use the installed realm settlement or comparison reviewer on exact source accounts.
args:
  claim: RegencyClaim
  opening: RegencySnapshot
  current: RegencySnapshot
  forecasts: RegencyForecast[]
returns: RegencyFinding
---
Resolve each source using opening.accounts, current.accounts, or the matching forecast by horizon. A missing required projection yields a not-observed finding with no fabricated citation. For a settlement call reviewer.reviewExample.reviewRealm with kind settlement, the exact check and that current snapshot. For comparison call the same installed lambda with kind compare, the exact check, before and after accounts, assertCommitted as requested and basis forecast if either end comes from a forecast, otherwise observed. Keep the returned review and exact claim.
