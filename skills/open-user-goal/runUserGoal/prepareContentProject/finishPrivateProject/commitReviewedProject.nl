---
description: Commit only the exact current private project basis after local approval and review.
args:
  scope: ProjectScopeLease
  draft: AuthoredProjectDraft
returns: {eventId: string; head: string} | null
---
Call contentProjectCommit.commit with the exact scope receipt, actual reviewed snapshot head, and a short descriptive local commit message. Return its actual result.
