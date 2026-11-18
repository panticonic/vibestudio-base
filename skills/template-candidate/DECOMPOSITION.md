# Stage a workspace template update for review

This is the workspace-updates procedure for one caller-selected source, installed
baseline, and incoming commit. It uses the Templates and VCS APIs installed in
the current workspace.

| Responsibility | Implementation |
| --- | --- |
| Read the existing upstream status | `inspectOffer/readOffer` calls cached `templates.updateStatus`. The TypeScript binding selects the exact source and strips credentials and diagnostics. |
| Decide whether to stage | `inspectOffer/assessOffer` interprets freshness, compatibility, availability, and caller intent. Inspection and blocked offers finish here. |
| Prepare the exact candidate | `prepareCandidate/requestPreparation` invokes the public `templates.prepareUpdate` operation under the caller's established authority. The binding rechecks discovery before forwarding the original exact pin and operation ID. |
| Verify the review context | `reconcileCandidate/readCandidate` uses `templates.reviewUpdate` and VCS main-event metadata. Exact TypeScript checks bind the readback to the authorized operation, source and commit, the acknowledged context, and the currently protected main event. |
| Decide the next review step | `reconcileCandidate/chooseReview` distinguishes unresolved native conflicts from a candidate that needs semantic validation. Lost acknowledgments and mismatching or stale readbacks keep the operation unconfirmed. |

From workspace eval, bind the normal Templates client and current workspace VCS
main-state reader with `bindTemplateCandidate`. Supply the resulting services
while loading the joint workflow. The command ID is caller-issued and stays stable
when resuming the same assignment. Use the minimum accepted cache timestamp from
the caller's review window. The result hands off the isolated candidate for review.
