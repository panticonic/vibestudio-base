---
description: Decide which metadata criterion blocks the local webhook admission review.
args:
  assignment: WebhookAdmissionAssignment
  row: "WebhookAdmissionRow | null"
returns: WebhookAdmissionDecision
---
1. A missing row means hold-record. In all reviews, the row must use a direct OIDC metadata configuration without a secret and its exact receiver source, class, instance and method must match the assignment. A mismatch yields hold-target.
2. Check the requirement named by the assignment. Full covers all the following checks. Check JSON for payload, the minimum effective body byte limit for body-limit, and the exact configured header name for replay-key. Replay-window requires both the exact header and sufficient configured duration. Use hold-payload, hold-body-limit, hold-replay-key, or hold-replay-window for a corresponding failure.
3. Check dispatch-error retry for retry, rejection of malformed input for malformed, and the exact success status for status. Use hold-retry, hold-malformed, or hold-status when the matching check fails.
4. If the applicable checks pass, use stage-audit when allowed, otherwise report-only.
