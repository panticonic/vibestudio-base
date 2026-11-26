---
description: Decide which authorized evidence route can satisfy the user's request.
args:
  goal: string
  offer: RouteOffer
  authority: RouteAuthorityReport
returns: RouteChoice
---
1. Match the scope and timing in the request. Current working, last committed, original earlier, and separately retained private evidence serve different questions. Use the composite comparison for a request to check agreement between the current and private versions. A matching title or value alone cannot substitute for the requested scope.
2. A local route can execute only when each of its operation reviews is eligible. Ignore blockers belonging only to other routes. An external authority-only question selects the nominated link's preflight and performs no operation. Examine identical capability and canonical origin keys, even when link labels or hosts look similar.
3. Return its exact route id, whether the local route should execute, a brief reason and retain only for an explicitly requested private review.

If no actual eligible candidate can answer the requested scope, use a null routeId with execute false and explain the gap. Do not substitute another temporal coordinate or invent a route.
