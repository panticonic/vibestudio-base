---
description: Ask the installed local matcher to project the retained instruction at this exact owned slot.
args:
  board: TendrilRouteSnapshot
  slot: TendrilRouteSlot
returns: TendrilRouteProbe
---
Return project(board, slot). It forwards the board identity, chosen slot identity and observed board revision without reconstructing opaque IDs.
