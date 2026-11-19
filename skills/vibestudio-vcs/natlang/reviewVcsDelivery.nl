---
description: Review delivery of an assigned semantic VCS file across the working, committed, and protected-main states.
args:
  request: VcsDeliveryRequest
returns: VcsDeliveryReport
---
1. Call vcsDeliveryRead.observe with request.operationId. Preserve its exact snapshot. If snapshot.current is false, return that snapshot with null chain and review, and next refresh.
2. Call inspectChain with the snapshot. Call reviewChange with the goal and snapshot.file. Use those results to call chooseDeliveryStep.
3. Return the snapshot, chain, review and next step. Describe only actions the caller could take. A review neither verifies tests have passed nor completes a commit or publication.
