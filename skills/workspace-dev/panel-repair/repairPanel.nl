---
description: Repair the requested behavior of a live workspace panel and verify it in the browser.
args:
  request: Request
returns: Report
---
Work in the panel and workspace the caller assigned. Use the functions in your callable folder and the panelRepair service.

1. Read initial = panelRepair.observe(). Call defineChecks(request, initial), then reproduce(request, initial). Keep its recorded interaction and observed evidence. If the panel cannot load, retain that failure as evidence for diagnosis. If a usable panel does not reproduce the reported behavior, explain the evidence and what is missing before editing.
2. Call diagnose(request, initial, reproduction, []) to locate the cause and read the relevant source. Read the paths from the finding at the current revision. Call proposeRepair with that finding and the current source. If no justified edit is proposed, report the open question or blocker. Apply its exact edits at the current revision. Build the returned revision.
3. If the build fails, diagnose from the new diagnostics and changed source before proposing another edit. If it succeeds, rebuild the same panel at the built revision and call verifyRepair with the new observation, checks and original reproduction. A failed verification becomes evidence for the next diagnosis.
4. Repeat diagnosis only when you have new evidence or an untried hypothesis grounded in the current evidence. Keep earlier findings and candidate outcomes. If the evidence supports no remaining repair, report the specific blocker. Never repeat the same failed operation with the same inputs.
5. Return verified only after verifyRepair checks the requested behavior and existing behavior the change could affect. Report the verified revision and its evidence.
