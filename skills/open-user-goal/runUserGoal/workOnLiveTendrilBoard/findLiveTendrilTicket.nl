---
description: Find the current owned live board and read its local presentation ticket.
args:
  goal: string
returns: LiveTendrilTicket | null
---
1. List owned presentation tickets with tendrilBoardDocket.list. Select one current card with the title requested by the goal. Retired editions do not authorize a presentation.
2. Read its exact id using tendrilBoardDocket.read. Require the returned card to match and use the exact installed labels, fields, controls and authorized layout candidates.
