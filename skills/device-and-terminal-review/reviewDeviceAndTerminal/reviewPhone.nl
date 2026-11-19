---
description: Find the next condition in phone setup, with separate attached and paired device identities.
args:
  input: PhoneSetupEvidence
returns: DeviceTerminalReview
---
1. Call identifyPhone. Return its report when workspace, provider, or device selection cannot yet be established.
2. If there is a pairing or readiness receipt, call reviewPhoneReadiness. Otherwise call explainDiscovery with the selected device from identifyPhone.
