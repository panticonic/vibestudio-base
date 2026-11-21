---
description: Prepare a new private workspace content project based on exact owned source and approval evidence.
args:
  goal: string
returns: PreparedContentProjectReport
budget: {maxTurns: 25}
---
1. Call reviewProjectEvidence with the original goal. Keep the exact returned evidence and decision.
2. When the decision is hold, return a held final outcome with null scope, draft, candidate and event. Otherwise call confirmProjectScope with the exact evidence and decision. Return held if it holds and held-moved if the original source revision moved.
3. With an admitted scope, call authorProjectDocuments. If the author cannot produce a grounded review, carry its current result and stop with review-needed.
4. Call finishPrivateProject with the decision, exact scope and actual reviewed draft when ready. Preserve the real local event or working candidate. A draft remains private. No action publishes or notifies anyone.
