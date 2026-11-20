---
description: Compare a recovered setting value with the actual final working file.
args:
  prior: ArchiveSnapshot
  head: string
returns: ArchiveReview | null
---
Call services.reconciliationArchive.readCurrent with the exact observed record ID and final working head. If unavailable return null. Compare the actual current value and the earlier value. Return the prior record unchanged, the exact current result, and relation matches if the current key exists and the value is the same. Otherwise return changed.
