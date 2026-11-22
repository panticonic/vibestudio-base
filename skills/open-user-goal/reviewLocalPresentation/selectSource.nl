---
description: Compare local records to establish exactly which source the goal permits.
args:
  goal: string
returns: PresentationSourceChoice
budget: { maxTurns: 12 }
---
Call listRecords before deciding. Read each listed candidate with readRecord and compare their owner, period, approval, and status against the user goal. Select the single matching record only if previewAllowed is true. If no authorized, sufficiently specific source exists, hold with the missing authority or provenance condition. Do not copy facts from unrelated or archived alternatives to make a source look complete.
