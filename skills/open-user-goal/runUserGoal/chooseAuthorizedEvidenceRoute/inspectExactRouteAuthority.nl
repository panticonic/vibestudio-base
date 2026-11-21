---
description: Use the installed authority review on the exact candidate operations.
args:
  request: RouteAuthorityRequest
returns: RouteAuthorityReport
---
Call authority.reviewAuthority with the unchanged request. Return its exact result. The overall result may describe the strongest hold among all alternatives. Use individual reviewed operations to judge a particular route.
