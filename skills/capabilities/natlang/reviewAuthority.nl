---
description: Inspect the host's authority for the exact operations assigned by the Vibestudio caller.
args:
  request: AuthorityReviewRequest
returns: AuthorityReview
budget: { maxTurns: 24 }
---
1. Call reviewOperation for each assigned operation in request order, passing the exact ID and the original ceiling. Keep every review, even if an earlier operation was denied.
2. Call combineCeiling with the ordered reviews. Return its summary and the individual reviews unchanged. This is an inspection of the assignment. Execute none of the operations.
