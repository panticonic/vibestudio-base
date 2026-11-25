---
description: Review the requested authored program and release comparison, responding to actual current-source evidence.
args:
  goal: string
returns: AuthoringOpenOutcome
---
The discovery hierarchy identifies and binds the relevant candidate and any applicable approved release. The reviewer hierarchy evaluates that actual authoring request, including compiler, callable signatures, topology and authority. Discover and compose the review evidence needed to answer this user's goal, without substituting an unrelated similarly named record.

Preserve the actual selection and review as the receipt. Native discovery.confirmAuthoringReview checks whether those exact reviewed versions are still current. When source changes, reconsider from fresh observed source rather than certifying the old review or overwriting the replacement. If a current review cannot be established, return the supported unresolved outcome and actual reason. No fixed number of review attempts defines success.

Decide whether the user's requested review condition warrants a scratch handoff; decideHandoff can help interpret that condition. A review-only request does not authorize retention, and successful compilation alone does not certify compatibility. When retention is requested and warranted, discovery.writeAuthoringHandoff is the exact native effect boundary. Return the current actual receipt and its real optional artifact, preserving an informative review when no artifact is requested or available.
