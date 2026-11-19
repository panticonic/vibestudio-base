---
name: workspace-evidence
description: Interpret Vibestudio revision, browser and test receipts when deciding whether an observed outcome supports a claim.
---

# Workspace evidence

A workspace head identifies the observed revision. A changed head establishes that content changed. A claim about what changed needs the observed result or the resulting content at that head.

A green build establishes that the recorded source state compiled. A claim about runtime behavior needs a declared test report or activity observed in that runtime. Tie the result to its runtime and the same source state or artifact as the candidate.

A browser action receipt records an interaction. Verify the behavior with the resulting control value or visible content. A panel may rebuild or change generations between interactions, so match the readback to the candidate when the claim depends on the rebuilt code.

A merge receipt may leave unresolved coordinates. To support a claim that both intents survived, inspect the resulting values and applicable behavior after integration.

The shared [unit repair workflow](../../../../runWorkflow/repairUnit.nl) and
[workspace integration workflow](../../../../runWorkflow/integrateWorkspace.nl)
call the evidence checker with concrete observations. Unit repair uses the
declared verification report, and integration uses the merged content and its
observed behavior.
