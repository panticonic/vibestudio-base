---
description: Assign the exact current owned draft and its installed scaffold inventory.
args:
  goal: string
returns: { card: ScaffoldCard; options: ScaffoldOptions }
---
Call findScaffoldBrief with goal. Call readInstalledScaffolds with the exact card id. Return the actual card and options.
