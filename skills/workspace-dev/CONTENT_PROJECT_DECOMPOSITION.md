# Grounded content-project delivery

The shared Vibestudio workflow calls [deliverProject](../vibestudio-workflows/runWorkflow/deliverProject.nl) for the workspace-development project lifecycle. Private worlds, verification and adapters stay outside the program.

1. deliverProject: NL orchestration of actual context preparation, authored documents, readback review, local commit. Root-only writer alias; children receive reader alias only.
2. analyzeRequest: NL audience, deliverable roles, grounded constraints and ambiguities.
3. planDocuments: NL information architecture and assignment of facts to requested deliverable roles; no arbitrary page-count cap.
4. draftDocuments: NL source synthesis across finite planned pages; calls writePage for each.
5. writePage: NL writing for the particular audience and purpose, with exact fact-id provenance citations. Not a stock template renderer.
6. reviewCandidate: NL assessment of actual readback against requested roles, factual support and usability, not the proposed draft.
7. projectWorkspace / projectWorkspaceEdit: crisp I/O and authority-scoped VCS mechanics through actual prepareProjects, VCS repository/file queries, expected-head edits, local commit. Exact identities, path normalization, serialization, finite cursor traversal and repeat-cursor checks are crisp.
8. Independent verifier: harness-only actual state/history, sources ledger exact equality, actual document existence/citations/links, unchanged protected main and other repositories, clean local commit. This establishes effects and structural grounding; a separate semantic judge must assess whether prose is useful, accurate and covers the role. The actor's own review is not an independent oracle.

Two owned worlds: a release/rollback runbook with ordered reversible operations, and an onboarding handbook with role-dependent parallel prerequisites and a handoff. Every run needs a fresh isolated context and an assigned unique content repository. No model or live effects have been executed by authoring. Existing agentic project-lifecycle tests include publication; this draft deliberately covers the preparation/review/local-commit boundary and does not claim publication coverage.

## Executable binding and qualification

The factory lives in `packages/natlang-services/src/contentProject.ts`. It accepts the current execution's canonical VCS client and real `prepareProjects` function; its context identity must equal the assigned context before any effect. Only canonical Markdown paths in the assigned new content repository can be authored, and the original source ledger is captured before model execution. Catalog aliases expose observation separately from root-only preparation/writing/local commit. They bind to the same factory object through the normal caller-owned loader.

System-testing's private content-project RPC creates the binding in the fixture-owned ordinary EvalDO. The independent oracle inspects actual committed files, event applications, work units and protected-main state before the owning context is torn down. Its `semanticReviewInput` contains the actual readback bytes and privately cloned original request for the existing Natlang `modelOracleJudge` judged-oracle path. It does not contain a verdict. `semanticReviewRequired` remains true: a structurally passing live test is not sufficient for data admission. The actor's `reviewCandidate` is part of the workflow being trained and is not independent evidence.

Exact cases are `content-project-release-runbook`, `content-project-role-onboarding`, and the separate no-model `content-project-oracle-qualification` (actual reference, omitted-fact negative, renamed identity/value alias). The existing source case `commit-existing-project` is package-specific; this implementation ports its preparation/follow-up-edit/local-commit boundary to the documented content-project variant and does not claim package-build or publication coverage. No live or training outcome is asserted by these sources.
