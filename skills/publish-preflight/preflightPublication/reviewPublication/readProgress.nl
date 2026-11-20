---
description: Resolve the next review step from a matching journaled deployment.
args:
  receipt: PublicationObservation
returns: PublicationProgressReview
---
Before submission, return awaiting-provider and next resume-operation. In evidence cite the exact last completed phase and advise calling the same provider deployment routine with the original operation ID and immutable intent. The host journal skips phases already completed.

For a submitted receipt, call readSubmittedDeployment with the matching receipt and return the result.
