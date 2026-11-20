---
description: Read stable retained transcript windows for the selected conversations.
args:
  sourceIds: string[]
returns: RecoveryWindow[]
---
Call recoveryReplay.resume once per distinct selected source. Retain the returned windows in request order. Report their actual cursors, coverage, and exact retained messages unchanged.
