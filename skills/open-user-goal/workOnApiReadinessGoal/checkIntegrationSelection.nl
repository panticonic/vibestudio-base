---
description: Compare current authorizing selection with earlier history and the intended profile.
args:
  index: IntegrationIndex
  choice: SelectionChoice
  earlier: SelectionFrontier
  current: SelectionFrontier
returns: SelectionWitness
---
For a null choice return its reason and no message. Otherwise take the latest current selection for that profile and call confirmTrustedSelection with its exact receipt. Keep that result. The first read helps explain changes; it never authorizes a later lookup.
