---
description: Assess manifest compatibility using the exact working and protected package pair.
args:
  review: ExtensionReleaseReview
returns: CandidateComparison
---
1. Call readCandidate with the operationId from review.source.observation.
2. A candidate validation error is invalid. Any newly exposed method audience, expanded capability, or transition to startup activation needs authority-review.
3. Otherwise a different working tree needs verification even with an unchanged manifest. A matching tree is published-package. Keep the exact delta in the result.
