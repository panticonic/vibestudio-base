---
description: Separate selected observed receipt identities from incomplete evidence and attribute the original account.
args:
  request: ProblemRequest
returns: ProblemEvidenceReview
---
Call partitionReceipts for the record IDs. Use observed for the original account only if the assigned agent reproduced it; otherwise use unverified, even when a separate invocation diagnostic was directly observed. Return the partition and attribution exactly. Do not ask for full trajectories or add unselected records.
