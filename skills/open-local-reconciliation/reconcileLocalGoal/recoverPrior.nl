---
description: Recover the actual earlier owned record needed by this goal without borrowing a same-title proposal.
args:
  goal: string
  initialWindow: ReviewWindow
  initialView: ReconcileView
returns: ArchiveSnapshot | null
---
Use the actual archive catalog, native revision relationship and user qualifiers to choose which historical bytes are needed. Revision metadata may disambiguate records without reading every similar title. Read the relevant actual snapshots and use chooseHistoricalSource when useful; do not force an all-record route or treat a baseline proposal as the prior working decision merely because its title matches. Preserve the selected complete snapshot unchanged, including its source identity, setting, value, revision and hash. If the evidence cannot establish the requested record, return null rather than inventing or substituting it.
