---
description: Determine whether the user permits recovery from the latest owned working revision.
args:
  goal: string
returns: boolean
---
Determine whether the user permits recovery from the latest owned working revision. Return false when the user pins the earlier observed working evidence or requires an unchanged revision. Do not grant permission to copy; planRecovery separately assesses the requested edition, subset and copy authority.
