---
description: Check exact update candidate identity, conflicts, semantic validation and approval.
args:
  request: TemplateUpdateInput
returns: {next: "prepare-review" | "resume-review" | "resolve-conflicts" | "validate-candidate" | "await-approval" | "ready-to-publish"; basis:string}
---
If the review is absent, stale, or for another target pin return prepare-review with targetPin. Otherwise use its actual operationId. Resolve conflicts before claiming readiness. If semantic inspection or checks are incomplete, return validate-candidate, including when VCS reports a clean merge. When validation passed but user intent is only prepare, return resume-review so the existing operation remains the handoff. For publish intent require approval and return await-approval until granted. Then return ready-to-publish.
