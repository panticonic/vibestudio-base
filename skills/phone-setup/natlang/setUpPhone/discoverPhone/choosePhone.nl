---
description: Select an eligible attached phone or give a single physical next step.
args:
  discovery: DiscoveredPhones
  assignedDeviceId: string | null
returns: PhoneSelection
---
1. Consider only the assigned device when assignedDeviceId is present. Otherwise consider all discovered devices.
2. If one eligible device is ready, select its exact deviceId. If multiple devices are ready, return choose-phone and direct the user to choose a phone in the setup card.
3. Otherwise return physical-action with no deviceId. Use one actionable instruction supported by the discovered state and any applicable action. If there is no applicable action, ask the user to connect or unlock the assigned phone and then rediscover.
