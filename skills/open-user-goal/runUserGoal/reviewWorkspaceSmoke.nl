---
description: Find the exact local smoke specification and verify the installed package result.
args:
  goal: string
returns: WorkspaceSmokeReport
budget: { maxTurns: 40 }
---
1. Call discoverWorkspaceSmoke with no arguments to obtain the exact task and approval.
2. Call inspectSmokeFiles(assignment) to find and read the bounded current candidate files.
3. Call selectSmokeContract(assignment, source).
4. When the selection has one approved plan, call exerciseInstalledSmoke(assignment, selection.plan). A blocked selection has null runtime.
5. Call compareSmokeOutput(assignment, selection, runtime). If decision.mayRetain, call stageWorkspaceSmoke(assignment, selection, runtime, decision).
Return assignment, source, selection, runtime, decision and the actual optional receipt.
