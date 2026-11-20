---
description: Resolve public readiness for a submitted deployment without repeating the submission.
args:
  receipt: PublicationObservation
returns: PublicationProgressReview
---
1. If the recorded URL has no observed ready response, return awaiting-provider and next watch-provider. Watch the deployment already recorded by the provider.
2. If the URL is observed ready but the public manifest digest has not been verified, return verify-public and next verify-public.
3. When the URL is observed ready and serves the exact verified public manifest, return no blockers and next complete.
4. Cite the submitted phase and the readiness or digest evidence that determines the next step.
