---
description: Repair the requested behavior of a live workspace panel and verify it in the browser.
budget: { maxTurns: 32 }
args:
  request: Request
returns: Report
---
Work in the panel and workspace the caller assigned. Use the functions in your callable folder. Read and inspect through panelRepair. Apply, build, and activate the candidate with panelRepairEdit.

1. Read initial = panelRepair.observe(). Call defineChecks(request, initial), then reproduce(request, initial). Keep its recorded interaction and observed evidence. If the panel cannot load, retain that failure as evidence for diagnosis. If a usable panel does not reproduce the reported behavior, explain the evidence and what is missing before editing.
2. Call diagnose(request, initial, reproduction, []) to locate the cause and relevant files. Read those files at the current revision. Call proposeRepair with the finding and source. If it proposes a justified edit, apply its exact edits through panelRepairEdit.apply. Build the revision returned by the edit using panelRepairEdit.build.
3. If the build fails, diagnose from the new diagnostics and changed source before proposing another edit. If it succeeds, call panelRepairEdit.rebuild at that revision, then call verifyRepair with the new observation, checks and original reproduction. Read the current revision before acting on any failed verification.
4. Repeat diagnosis only when you have new evidence or an untried hypothesis grounded in the current evidence. Keep earlier findings and candidate outcomes. If the evidence supports no remaining repair, report the specific blocker. Never repeat the same failed operation with the same inputs.
5. Return the typed Report. Set status to verified only after verifyRepair checks the requested and preserved behavior. Otherwise set status to blocked and report the current revision and missing evidence.
