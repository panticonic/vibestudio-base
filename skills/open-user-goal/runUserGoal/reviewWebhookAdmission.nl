---
description: Compare a retained first-party registration with the current owned webhook metadata.
args:
  goal: string
returns: WebhookAdmissionOutcome
budget: { maxTurns: 25 }
---
1. Get the actual assignment from discoverWebhook. Ask inspectWebhookStatus for its retained receipt and native active and historic facts.
2. Call matchRegistration on those values. Call assessWebhookAdmission with the actual assignment and binding. Keep the exact binding, policy disposition and reason.
3. If the assessment chooses stage-audit, call stageWebhookAudit with the exact assigned evidence, binding and assessment. Retain the actual receipt. Otherwise handoff is null.
4. Return the actual assignment, evidence, binding, assessment and handoff. Review metadata only. The result says which settings are configured and does not claim any event was sent, verified or accepted by a receiver.
