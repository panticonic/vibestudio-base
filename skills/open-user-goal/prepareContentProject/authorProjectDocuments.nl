---
description: Plan and compose the private project from scoped facts and inspect the actual written candidate.
args:
  scope: ProjectScopeLease
returns: AuthoredProjectDraft
---
1. Use the admitted scope's request. Call compose.analyzeRequest and compose.planDocuments. If their brief or plan is blocked, return null before prepare.
2. Call compose.draftDocuments using the request and actual brief and plan. Call compose.completeNavigation with the actual returned drafts and plan.
3. Call writeInitialProject with the admitted scope and exact complete files. If it returns null, hold without claiming to have written a project.
4. Call compose.reviewCandidate with the exact written snapshot files, request, brief and plan. If its concrete findings can be repaired from the supplied evidence, use compose.reviseDocuments(request, plan, current documents, review), readProjectCandidate and reviseProjectCandidate to improve the actual current candidate, then review its new readback. Preserve supported work; each revision must resolve a concrete finding rather than repeat an unchanged attempt. Stop with the observed candidate and review when ready, when essential evidence or authority is missing, or when the findings cannot be improved. The private source scope permits revisions before its final local commit; it does not require a perfect first draft. Only the independent verifier attests final artifact quality.
