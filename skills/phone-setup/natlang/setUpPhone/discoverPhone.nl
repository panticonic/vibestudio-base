---
description: Select an eligible desktop, prepare it and discover the assigned attached phone.
args:
  assignment: SetupStart
returns: PhoneDiscoveryReport
budget: { maxTurns: 16 }
---
1. Call chooseDesktop with assignment. If no desktop was selected, return desktop-unavailable if there are no eligible desktops for this assignment; otherwise return choose-desktop. Give the corresponding instruction to open the desktop app on this account or choose the desktop in the setup card. Return no evidence IDs because this branch used only the assignment evidence.
2. Call prepareDesktop with the assignment receipt and the chosen providerId. If preparation is unconfirmed, report preparation-unconfirmed with its receipt and advise inspecting the setup card.
3. Call observePhones with the preparation receipt, then choosePhone with that discovery and the assigned deviceId. Return its status, deviceId and guidance with the preparation and discovery receipts in order.
