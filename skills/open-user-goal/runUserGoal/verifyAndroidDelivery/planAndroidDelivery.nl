---
description: Decide which installed Android scenario the user requested within the observed test scope.
args:
  goal: string
  scope: AndroidDeliveryScope
returns: MobileAssignment
---
1. Use scenario pair for desktop pairing or inspecting readiness to pair. Use development for installation or launch of the internal development client.
2. Use authority inspect when the user asks only to check a device. Use execute if the user requests an operation, even conditionally, so its live authority can hold it when the condition is missing. Use reset true only for an explicit request to reset the disposable test app before launching.
3. Return the original goal, exact scope workspace and device id, and the chosen scenario, authority and reset values.
