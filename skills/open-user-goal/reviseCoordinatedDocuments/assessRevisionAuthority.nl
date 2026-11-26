---
description: Establish which exact signed workspace facts can support the requested coordinated revision.
budget: { maxTurns: 10 }
args:
  goal: string
  scope: RevisionScope
returns: RevisionAuthority
---
Establish the factual and authorization premises needed before the requested revision can begin. Formulate required as propositions that the current workspace evidence can establish now: which current owner has approved which replacement fact and any actual scope, signature, audience or other conditions attached to that approval. Preserve the user's exact names, values, units, exceptions and signature conditions in these premises. For example, a request to update an entrance guide needs the premise that the current signed decision approves the requested entrance; it does not need the premise that the guide has already been updated.

The user goal supplies the requested owned destinations, formatting and preservation obligations. Those are authoring instructions, not facts that a signed source must independently restate. Do not demand that an approval document name both destination paths or prescribe the requested output format unless the goal or actual approval explicitly makes that a precondition. Do not use the user request itself as proof of an independently required signed fact.

Call buildRevisionObservations with the exact scope. Use its unaltered return value as observed when calling evidenceRules.checkSupport with the factual premises as required. Do not pass the whole imperative user goal or statements that the requested edit, commit or readback has already happened: this assessment runs before mutation and again after a conflict. Do not turn absent approval into assumed approval or weaken a required condition to obtain support. Distinguish current signed facts from drafts, archived proposals, withdrawn decisions and approvals that cover only part of a requested change. A missing required signature or conflicting current authority remains missing.

Return required, observed, and the exact supported and missing arrays from the evidence check. Load the workspace-evidence knowledge skill when needed to distinguish an approval statement from a proposed action or receipt. Planning and native readback establish the later requested effects; this function establishes their preconditions.
