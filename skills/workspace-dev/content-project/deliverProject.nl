---
description: Deliver a grounded content project through actual preparation, review and local commit.
args:
  request: Request
returns: Report
---
1. Observe initial through projectWorkspace.observe. The caller assigned this context and repository. If a repository already exists, return blocked with that observed basis; do not overwrite existing work.
2. Call analyzeRequest(request), then planDocuments(request, brief). If the brief has unresolved ambiguities or the plan has blockers, return blocked without preparing anything.
3. Call draftDocuments(request, brief, plan). Prepare the assigned content project using projectWorkspaceEdit.prepare(initial.head), then write those documents at the returned head with projectWorkspaceEdit.writeDocuments. Preserve both actual operation outcomes.
4. Independently obtain readback through projectWorkspace.observe and call reviewCandidate(request, brief, plan, readback). If its ready flag is false, return blocked with its actual findings and leave the candidate uncommitted for inspection.
5. Only when review establishes complete grounded content, locally commit exactly readback.head using a concise message describing this deliverable. Report the returned eventId and actual head as committed. This workflow does not publish or activate code.
6. If an operation rejects a stale basis or another concrete error, observe actual state and report blocked with that evidence; do not claim rollback of an earlier operation or report a commit that did not occur.
