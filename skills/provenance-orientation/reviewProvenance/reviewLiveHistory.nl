---
description: Review the assigned VCS coordinates in order using their live provenance walks.
args:
  request: HistoryRequest
returns: ProvenanceReport
---
For each assigned check in order, call readAssignedHistory with that check. Call assessHistoryReceipt on the returned observation. Retain both the receipts and their ordered findings. When request.proposedProperty is present, call assessProposedProperty with the request and receipts. Return live-history with the findings and the returned constraint when assigned.
