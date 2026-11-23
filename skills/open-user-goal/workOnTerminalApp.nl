---
description: Repair the user's currently owned terminal application and keep exact native verification.
args:
  goal: string
returns: TerminalRepairReport
budget: { maxTurns: 26 }
---
1. Call inspectTerminalApp for the original goal. Keep its exact app and initial check. Call reviewTerminalCandidate with the original goal and that check. Keep all plans and edit results.
2. With a hold plan, return hold-edit or hold-test as given. With a blocked plan, return blocked. Never modify the app in those cases.
3. For repair, call terminalRepairApply.edit with the exact app ID, observed revision and proposed edits. If the effect says moved, return hold-moved and retain the new revision as evidence that the earlier reviewed basis expired.
4. Call verifyTerminalOutput for a completed candidate, or an existing candidate reported ready. Only verified or already-ready may carry the exact artifact associated with the confirmed revision. If verification is incomplete, report blocked with its evidence. Return only the actual verified artifact or null, the repair outcome, and a brief explanation of the remaining repair or verification issue. Do not publish or launch the app.
