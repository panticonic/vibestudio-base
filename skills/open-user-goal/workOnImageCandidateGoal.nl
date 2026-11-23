---
description: Reconcile retained image attempts, inspect original output and complete an authorized private handoff.
budget: { maxTurns: 34 }
args:
  goal: string
returns: ImageCandidateResult
---
1. Discover the owned image briefs through workspace.discoverImageBriefs. Call chooseImageBrief with the exact goal and index.
2. Call workspace.readImageJournal twice for the exact owned channel. If either frontier is absent, return a held result with no candidates, originals or handoff. Otherwise call assessImageAttempts with the goal, index, plan and both receipts. Retain any differences between the two frontiers.
3. In assessment queue order, call workspace.readImageOriginal once for each candidate with plan.briefId. Preserve each result exactly. Call decideImageHandoff with the unchanged goal, plan, assessment and all native original reads.
4. Build the ImageReport with the original plan, assessment, reads and decision and handoff null. If the decision is stage, call workspace.stageImageHandoff with that report and include the unchanged receipt. Return result of the exact internal report: the candidate findings, verified original handles, settled decision and private handoff receipt.
