---
description: Diagnose presentation, update, event and archive state in the assigned Tendril.
args:
  input: TendrilEvidence
returns: DeviceTerminalReview
---
1. Call inspectPresentation to establish channel, device and slot. Return its non-null report.
2. For update call inspectUpdate. For event call inspectEvent. For archive call inspectArchive.
