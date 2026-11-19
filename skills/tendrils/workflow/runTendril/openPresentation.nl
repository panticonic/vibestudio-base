---
description: Choose and present the assigned Tendril on a device that can serve the request.
args:
  request: TendrilRequest
returns: TendrilPresentation | null
---
1. Load the actual inventory with tendrilPresentation.devices.
2. Call selectTendrilDevice with the devices and request. Return null if it found none.
3. Call tendrilPresentation.present with the chosen device id and return its exact receipt.
