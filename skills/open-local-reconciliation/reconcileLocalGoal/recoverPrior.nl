---
description: Select an earlier owned evidence record from actual archived bytes and its native source.
args:
  goal: string
  initialWindow: ReviewWindow
  initialView: ReconcileView
returns: ArchiveSnapshot | null
---
1. Call listArchive. Read the plausible records with readArchive, including similar titles that could refer to different revisions.
2. Call chooseHistoricalSource with the user's goal, the initial window, source comparison and the actual snapshots. Resolve a source by its captured setting value or exact revision relationship. Return the source itself unchanged if it is established. Otherwise return null.
