---
description: Join the currently assigned reader and check what can be inspected.
args:
  index: NewsEvidenceIndex
  earlier: NewsEvidenceSnapshot
  current: NewsEvidenceSnapshot
returns: ReaderBoundary
---
Select the newest reader-state row from the current frontier. Keep its message ID when present. The earlier frontier is history. A request for a different reader, or a row from another context or reader, yields foreign-reader. A missing row gives reader-unobserved. A different generation yields stale-reader, and a current denial yields reader-revoked. Otherwise return verified-reader. Never copy grants from the previous frontier or retarget a reader.
