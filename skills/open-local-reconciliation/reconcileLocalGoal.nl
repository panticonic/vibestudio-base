---
description: Coordinate the user's current project settlement, retained-source comparison and requested evidence.
args:
  goal: string
returns: ReconcilePreparation
budget: { maxTurns: 16 }
---
Choose the investigation and continuation needed by this actual goal. The window and project helpers expose current native evidence; recoverPrior can establish an authorized historical record when the user asks about an earlier owned note. Carry that full actual snapshot into reconcileProject rather than dropping its qualifiers or asking a planner to rediscover inaccessible evidence. Hold honestly if a genuinely required prior cannot be established.

Separate request interpretation from execution. requestsHandoff is a private intent-only leaf for deciding whether an artifact was asked for; interpreting that predicate must not perform project changes or become a second coordinator. Delegate actual settlement to the project investigation using the unchanged goal and retained source evidence, and consume its actual latest integration result. If another operation or refinement changes the project, reassess from the current view and real feedback instead of returning an earlier held result beside a new window.

For requested handoff evidence, use prepareEvidence only at an actually verified current integration head and preserve the real returned assignment/refusal. Compare a recovered record with the actual final head using comparePrior when its agreement was requested. Return the current integration, genuine handoff intent, actual evidence assignment or null, and actual prior comparison or null. Do not replace a requested comparison with bookkeeping status, lose an accepted result, or manufacture a record or artifact. The available helpers do not prescribe a fixed route.
