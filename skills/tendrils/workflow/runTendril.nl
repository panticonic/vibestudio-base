---
description: Present and continue a live Tendril in an assigned workspace and verify each requested effect.
args:
  request: TendrilRequest
returns: TendrilReport
---
1. Call openPresentation with the user's platform preference and permission to queue for an offline device.
2. For no presentation return blocked with null presentation and no findings. For pending-device or pushed return pending with the actual presentation and no findings.
3. Call runSteps with the live presentation and the requested steps. Return the actual findings in order. If any finding is blocked, return blocked. Otherwise return verified.
