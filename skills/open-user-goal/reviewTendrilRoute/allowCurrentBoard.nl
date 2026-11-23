---
description: Determine whether the user permits the refreshed current edition of the same board.
args:
  goal: string
  previous: TendrilRouteSnapshot
  current: TendrilRouteSnapshot
returns: boolean
---
Determine whether the user permits the refreshed current edition of the same board. Return false for a pinned earlier revision, a changed audience or owner scope, or a retired/nonmatching board. Return true only when the user permits current state and the observed room, audience and source still satisfy the request.
