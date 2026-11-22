---
description: Ground a requested document revision in discovered public source evidence.
args:
  goal: string
returns: ResearchRevision
budget: { maxTurns: 36 }
uses: [investigatePublicQuestion, reviseWorkspaceDocument]
---
1. Call investigatePublicQuestion with the requested research and revision goal. Preserve the citations, unanswered questions and retrieval evidence.
2. Determine whether the evidence supports the requested document change. If essential facts are unresolved, return the research with a null revision.
3. Otherwise pass the goal and the actual research result to reviseWorkspaceDocument. Return the research and the revision's actual application result. Its reconciliation stage owns conflicts with current workspace state.
