---
description: Review the assigned VCS coordinates in order using their live provenance walks.
args:
  request: HistoryRequest
returns: ProvenanceReport
---
For each assigned check in order, call readAssignedHistory with that check. Call assessHistoryReceipt on the returned observation. Preserve the findings in order and return live-history with those findings.
