---
description: Activate one approved owned automation and verify its retained native schedule, or hold for exact missing authority.
args:
  goal: string
returns: OwnedAutomationActivationReport
---
1. Call reviewLaunchEvidence with the original goal. Preserve the actual observed evidence, plan and decision.
2. Pass the exact review to completeAutomationLaunch. With current authority it binds the launch and reads the exact new definition. Other decisions stop before launch.
3. Return decision and activation. An active automation with zero runs has no completed result. A draft or valid old approval does not prove activation.

Return the actual activation result or null and decision. Native schedule readback and input evidence remain in working calls.
