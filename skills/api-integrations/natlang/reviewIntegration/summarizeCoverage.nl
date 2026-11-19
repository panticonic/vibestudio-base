---
description: Determine overall coverage and give the next step for any required destination.
args:
  goal: string
  destinations: IntegrationDestination[]
  reviews: DestinationReview[]
returns: IntegrationCoverage
---
1. Check the required destinations first. If any required destination is unverified or unreviewed, return authorization-unverified. Ask for the existing lookup's authorization or recovery to be resolved before repeating the review.
2. If a required destination lacks a binding, return setup-needed and ask only for the relevant provider and audience facts. Describe the destinations by public purpose.
3. Otherwise if a required binding is expired or revoked, return renewal-needed and ground the advice in the observed lifecycle, including whether it can refresh.
4. If every required destination is ready, return ready. Mention optional gaps only if they affect the goal. A binding review establishes coverage and lifecycle, not successful use of an API.
