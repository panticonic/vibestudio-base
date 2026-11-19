---
description: Decide whether a sealed website package and exact target still match a retained review.
args:
  request: PublicationRevisionRequest
returns: PublicationRevisionReport
---
1. Call publicationRevision.compare with the assigned operation ID. Use the exact returned comparison.
2. Call matchPublicationTarget with both intents. Call assessRevisionChange with the comparison.
3. Return review-target for a different target, keeping the impact on public files. For the same target, return review-public-change if artifact digests or entry paths differ or any public path changed. Otherwise return keep-review.
4. Explain the chosen decision in one sentence. Identify the relevant target differences or public paths. Return the exact comparison and both call results.
