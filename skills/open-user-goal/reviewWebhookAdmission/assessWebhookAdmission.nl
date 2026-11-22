---
description: Assess the current selected registration against the explicitly assigned metadata requirements.
args:
  assignment: WebhookAdmissionAssignment
  binding: WebhookAdmissionBinding
returns: WebhookAdmissionAssessment
---
If the binding has a hold, return it with a concise reason. Otherwise call assessRequiredPolicy with the actual assignment and row. Return its decision and a short evidence-based reason. A successful review confirms matches in observed configuration, never delivery or proof of retry success.
