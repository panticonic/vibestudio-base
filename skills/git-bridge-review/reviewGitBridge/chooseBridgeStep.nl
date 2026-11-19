---
description: Choose the immediate Git Bridge step supported by both live observations.
args:
  direction: GitBridgeDirection
  view: GitBridgeView
  upstreamReview: GitBridgeUpstreamReview
  semanticReview: GitBridgeSemanticReview
returns: {next: GitBridgeNext, reason: string}
---
Apply these rules in order.
1. A pending candidate calls for compare-candidate, preserving the exact event. Integration-required without coordinates calls for diagnose-observation.
2. Auth failure calls for check-credential. A transfer in progress calls for await-transfer. A failed observation calls for diagnose-observation.
3. For export, if the source is missing use diagnose-observation. If the source is local-only, or the requested local work still needs publication, use verify-semantic-publication before considering transfer.
4. For a local-only upstream and an import goal with no working or protected repository, use import-project. Otherwise a local-only upstream needs configure-upstream. For not-materialized, use import-project if importing a repository absent from the workspace; preview-pull if importing into an existing workspace repository; verify-export for a protected source assigned for export. For diagnosis alone, report the state and identify the applicable options.
5. When a fresh observation gives the local Git projection relationship behind or diverged, use preview-pull before any export. If a fresh observation shows the target branch is absent, report that fact for import or diagnosis, or use verify-export for an assigned protected-main export.
6. For an export of a current, exportable projection with no above blocker, use verify-export if it is ahead. Otherwise report the current result. Explain the evidence behind the first supported step.
