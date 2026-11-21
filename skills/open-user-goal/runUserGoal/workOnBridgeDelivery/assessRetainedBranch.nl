---
description: Interpret the authority of the retained branch receipt without inferring a new external observation.
args:
  scope: DeliveryScope
returns: BranchAssessment
---
1. If there is no retained row, return missing. A wrong repository, remote or branch yields target-mismatch even if the receipt repeated the expected title.
2. If the retained row carries an unpublished candidate, return candidate-pending. A current attempt with no successful observation or an authentication, fetch, or observation failure yields failed-observation. Its last successful time is history.
3. If the successful observation preceded reviewSince, return stale. An explicit negative branch-exists observation yields branch-absent.
4. An observed behind or diverged relationship yields the corresponding hold. An exact existing aligned or ahead branch yields aligned evidence for this local review only. If relationship remains unavailable, return failed-observation.
5. Explain the specific evidence or missing condition. Every external observation remains retained; nothing in this workflow refreshes it.
