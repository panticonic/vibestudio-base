---
description: Identify the relevant current mobile record among similar owned local dossiers.
args:
  goal: string
returns: MobileContinuityProfile
budget: { maxTurns: 12 }
---
Call listProfiles, then readProfile for every listed candidate. Select the current exact workspace, device and package evidence requested. A same-name archived profile cannot substitute. Preserve the observations rather than inventing a successful attached device.
