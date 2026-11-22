---
description: Stage a small private note from exact verified registration metadata.
args:
  assignment: WebhookAdmissionAssignment
  evidence: WebhookAdmissionEvidence
  binding: WebhookAdmissionBinding
  assessment: WebhookAdmissionAssessment
returns: WebhookAdmissionReceipt
---
Return webhookAdmissionHandoff.stage(assignment.id, evidence.retainedDigest, binding.row, assessment.disposition).
