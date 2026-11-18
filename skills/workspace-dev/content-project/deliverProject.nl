---
description: Deliver a grounded content project through actual preparation, review and local commit.
args:
  request: Request
returns: Report
---
1. Observe initial through projectWorkspace.observe. The caller assigned this context and repository. If a repository already exists, return blocked with that observed basis; do not overwrite existing work.
2. Call analyzeRequest(request), then planDocuments(request, brief). If the brief has unresolved ambiguities or the plan has blockers, return blocked without preparing anything.
3. Call draftDocuments(request, brief, plan), then completeNavigation on its result and plan. Prepare the assigned content project using projectWorkspaceEdit.prepare(initial.head). Write the returned complete documents at the prepared head.
4. Obtain actual readback through projectWorkspace.observe and call reviewCandidate(request, brief, plan, readback). When the review identifies concrete issues, call reviseDocuments(request, plan, readback, review), complete its navigation, and apply the revision at the observed head. Keep each applied revision and independently read and review it.
5. Continue revising only if the number of reported unsupported claims and blockers strictly decreased. If a revision is unjustified, contains no changes, or fails to make progress, leave the candidate uncommitted and return blocked with the latest review.
6. When the review establishes complete grounded content, locally commit exactly the verified readback.head using a concise message describing this deliverable. Report the returned eventId and actual head as committed.
7. If an operation rejects a stale basis or another concrete error, observe the actual state and report blocked with that evidence. Keep the actual outcome of earlier operations in the report.
