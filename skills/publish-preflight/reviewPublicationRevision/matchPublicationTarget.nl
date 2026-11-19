---
description: Match the reviewed and candidate provider, destination and environment.
args:
  reviewed: PublishIntent
  candidate: PublishIntent
returns: '"same-target" | "different-target"'
---
Return same-target only if provider, destination and environment all match exactly. Otherwise return different-target.
