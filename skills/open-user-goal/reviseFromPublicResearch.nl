---
description: Ground a requested document revision in discovered public source evidence.
args:
  goal: string
returns: ResearchRevision
budget: { maxTurns: 36 }
uses: [investigatePublicQuestion, reviseWorkspaceDocument]
---
1. Inspect the actual target and supporting workspace documents with inspectRevisionContext before choosing the public question. Keep those original observations. Use identifyResearchQuestion with the goal and those documents to separate the public factual question from the original revision goal. Call investigatePublicQuestion with that research question. This child owns research, not access to or edits of the workspace draft. Preserve its citations, unanswered questions and retrieval evidence.
2. Determine whether the evidence supports the requested document change. If essential facts are unresolved, return the research with a null revision.
3. Otherwise pass the original goal and the actual research result to reviseWorkspaceDocument. Return the research and the revision's actual application result. Its reconciliation stage owns conflicts with current workspace state.
