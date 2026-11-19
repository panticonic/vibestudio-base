---
description: Choose the first usable device in the caller's platform order.
args:
  devices: TendrilDevice[]
  request: TendrilRequest
returns: TendrilDevice | null
---
For each platform in request.platforms, find the first online device of that platform in inventory order. Return the first match. If no allowed platform has an online device and allowPending is true, use the first offline device in that platform order. Otherwise return null.
