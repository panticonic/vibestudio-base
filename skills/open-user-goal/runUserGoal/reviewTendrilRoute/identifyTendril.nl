---
description: Select the exact local Tendril for the user's requested room, owner audience, source, and edition.
args:
  goal: string
returns: TendrilBoardChoice
budget: { maxTurns: 12 }
---
Call listBoards and read each board with readBoard. Compare its retained room title, audience, source, and edition to the user's goal. Do not borrow controls or permission from a different copy. If no current scoped match exists, or the request leaves indistinguishable candidates, hold and give the reason. Otherwise return the actual read record.
