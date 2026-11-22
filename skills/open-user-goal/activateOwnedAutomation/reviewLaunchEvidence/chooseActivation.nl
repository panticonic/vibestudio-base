---
description: Decide whether exactly one current owner consent supports the planned operation.
args:
  evidence: AutomationLaunchEvidence
  plan: LaunchPlan|null
returns: AutomationLaunchChoice
---
1. If existing identifies a retained active definition for this exact operation, hold with already-active.
2. Find current records. Hold with ambiguous when more than one remains. An exact approval must match the account owner and operation. Hold with scope-mismatch when it does not. An archive cannot supply current approval.
3. Respect pending, withdrawn and preview-only as explicit holds. With approval, require a fixed eval, a fresh private conversation and no outside operations. Accept a manual or scheduled interval. If requiresBound is set, preserve the approved maximum run count. Other plans hold with invalid-plan.
4. Return the exact selected consent only for activate. Holds use null consent and explain the actual obstacle.
