---
description: Compare exact approval and issue one scoped scheduler launch.
args:
  review: AutomationLaunchReview
returns: AutomationActivation|null
---
When review.plan is a launch and review.decision carries approval, return automationActivationCommit.activate(review.evidence.current, review.plan, review.decision). Otherwise return null.
