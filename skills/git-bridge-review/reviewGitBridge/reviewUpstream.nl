---
description: Interpret how the current observation affects the assigned Git operation.
args:
  direction: GitBridgeDirection
  upstream: GitBridgeUpstream
returns: GitBridgeUpstreamReview
---
Call checkFreshness with upstream. Then call interpretTransfer with direction, upstream and that freshness. Return the freshness and its consequence.
