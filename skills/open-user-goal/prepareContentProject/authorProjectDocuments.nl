---
description: Plan and compose the private project from scoped facts and inspect the actual written candidate.
args:
  scope: ProjectScopeLease
returns: AuthoredProjectDraft
---
1. Use the admitted scope's request. Call compose.analyzeRequest and compose.planDocuments. If their brief or plan is blocked, return null before prepare.
2. Call compose.draftDocuments using the request and actual brief and plan. Call compose.completeNavigation with the actual returned drafts and plan.
3. Call writeInitialProject with the admitted scope and exact complete files. If it returns null, hold without claiming to have written a project.
4. Call compose.reviewCandidate with the exact written snapshot files, request, brief and plan. Return the actual snapshot and review. Only the independent verifier can attest the complete artifact.
