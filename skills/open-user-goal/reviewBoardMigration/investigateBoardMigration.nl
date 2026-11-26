---
description: Produce actual scoped board-migration evidence for the outer coordinator.
args:
  goal: string
returns: BoardInquiry
uses: [reviewBoardMigration/locateSource, reviewBoardMigration/readMigrationTarget, reviewBoardMigration/chooseMigrationScope]
---
Locate the source board that actually matches the request and inspect the target basis when comparison or migration needs it. Select relevant source cards from their actual native contents and the user goal, preserving archive status and literal checklist/attachment details. Do not require a target read when it cannot contribute to a source-only question.

Return the real source view, available target basis and semantic selection, keeping unacquired or unavailable values null. This inquiry does not retain a board or turn a planned migration into a completed effect.
