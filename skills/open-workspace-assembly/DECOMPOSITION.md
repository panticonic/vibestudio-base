# Open workspace package assembly planning

The user describes a rollout, packaging change, or review outcome. The workflow
selects the relevant owned candidate, reads its multi-file contract at the
same semantic revision, reasons about the manifest dependency graph, and
decides whether current evidence supports a clean plan, a local repair draft or
no change. This family leaves all applied rollout and publication to other
workflows.

| Responsibility | Reused mechanism | Design |
| --- | --- | --- |
| Owned package materialization | System Testing verified-memory-managed.ts and workspace-repo-fixture.ts, Host blobstore.putText and vcs.importSnapshot | The reference fixture imports actual local portable packages and complete UTF-8 source through a native semantic event in a disposable context. It never advances protected main. |
| Exact workspace read | Host vcs.status, vcs.resolveRepository, vcs.listFiles, vcs.readFile | A selected read joins paths, manifest bytes, source bytes, and exact semantic revision. The verifier reads those independently after the result. |
| Revision-pinned build | Host build.getBuildReport and build.getBuildMetadata, installed workspace-dev | Build only selected authorized local units at the exact current context, bound to the verified source revision before and after. Retained immutable BuildMetadata is read independently by native build key. |
| Semantic decisions | New chooseAssemblyCandidate, interpretDependencies, chooseAssemblyVerification, and decideAssemblyOutcome lambdas | The model distinguishes same-named purpose candidates, build-time and runtime closure, stale review, candidate errors, authorization, and no-change conditions. No expected selectors or scoring records are model-visible. |
| Local draft | Base scratch-handoff-bindings and SST readWorkspaceBytes | Crisp code writes an assembly manifest and evidence through the existing atomic scratch writer. The document carries the requested parts, dependencies, proposed amendments, native build receipts and revision. It updates no managed source files. |
| Independent proof and capture | Existing HeadlessRunner open-goal route, Host typed evidence | Verify precise native inputs and receipts, actual manifest closure, selected parts, final disposition and artifact bytes without trusting the narrative. Keep package planning separate from applied unit rollout and general capability lookup. |
