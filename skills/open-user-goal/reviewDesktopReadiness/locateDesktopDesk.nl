---
description: Match the desktop handoff to the assigned desk.
args:
  goal: string
returns: DesktopDesk
---
Call desktopReadiness.discover. Quote the exact desk record whose name matches the owner's goal. Do not carry an adjacent desk's operation identity into the review.
