---
description: Check whether the original section supplies the facts needed to build its chosen view.
args:
  section: PresentationSection
  selected: DataComponent
returns: PresentationReadback
budget: { maxTurns: 5 }
---
Check whether the assigned section can answer its ask as selected. Compare needs two named options with the requested attributes. A plotted series needs actual values and a PlaceMap needs coordinates. Treat unconfirmed values as missing. Accept when a field missing from the source is optional for this ask. If required facts are missing, return rejected and name them.
