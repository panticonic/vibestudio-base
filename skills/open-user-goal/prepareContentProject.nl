---
description: Prepare a new private workspace content project based on exact owned source and approval evidence.
args:
  goal: string
returns: ContentProjectResult
budget: {maxTurns: 25}
---
1. Call reviewProjectEvidence with the original goal. Keep the exact returned evidence and decision.
2. When the decision is hold, return projectResult for a held finish with null candidate and event. Otherwise call confirmProjectScope with the exact evidence and decision. Return projectResult for a held or held-moved finish with null candidate and event when the scope holds or the original source revision moved.
3. With an admitted scope, call authorProjectDocuments. If the author cannot produce a grounded review, return projectResult for a review-needed finish using its actual current snapshot, if any, and null event.
4. Call finishPrivateProject with the decision, exact scope and actual reviewed draft when ready. Preserve the real local event or working candidate. A draft remains private. No action publishes or notifies anyone.

Carry the actual admitted scope and each returned candidate/review/finish value forward. A successful own write advances the workspace head; it does not invalidate its earlier authorization or mean another actor moved the original evidence. After finishing, keep the actual resulting project state and proceed directly to its return.

5. Return projectResult of the exact finish. This is the resulting private project handle, document paths and local event; source review and authorization remain internal call state.
