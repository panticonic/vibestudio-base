---
description: Review current owned evidence and prepare an accurate accessible presentation where authorized.
args:
  goal: string
returns: LocalPresentationOutcome
budget: { maxTurns: 16 }
---
1. Call selectSource(goal) to decide which record the user means. Honor dates, owners, approval and the user's version requirements. If it holds, return that reason with status held and revision null.
2. For the selected record, call visualize.preparePresentation with the original goal and the actual record's sections. Keep exact values, units, comparisons, time order, and uncertainty. Do not use another source to fill missing facts.
3. Call previewRecord with the selected record's id and revision and the actual presentation report. If the result is visible, return its exact receipt and any user-requested plain-text findings in notes, grounded only in the same record. Use one note per requested prose finding, and an empty list when no distinct prose finding is needed. If unavailable, return a held outcome with the current revision and its concrete reason.
4. If the preview reports a changed revision, call selectSource.readRecord on the same source again. If the user wanted a pinned version, hold and explain the revision change. If the user permitted the latest owned data and it is still authorized, repeat the presentation on the newly read sections and verify its preview. If the record moves again or cannot be used, hold with the newest observed revision.
