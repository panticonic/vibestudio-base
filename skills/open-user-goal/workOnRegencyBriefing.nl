---
description: Resolve an open Regency council decision with the current native accounts and installed reviewers.
budget: { maxTurns: 44 }
args:
  goal: string
returns: RegencyResult
---
1. Call realm.findRegencyRealm. Read the opening and current saved accounts separately through realm.readRegencyAccounts with its exact realm. Call planRegencyReview with the unchanged goal, installed index and both saved snapshots.
2. For each horizon in the plan, call realm.previewRegencySettlement on the exact current saved revision. Collect available projections in order. For each claim call qualifyRegencyClaim with the exact source records. Keep each finding.
3. Call decideRegencyAction with goal, plan, current accounts, forecasts, the realm index and findings. If it chooses advance call realm.advanceOwnedRegency once and keep the exact committed receipt. Otherwise set advance to null.
4. Assemble the full report with note initially null. Call realm.stageRegencyNote only for stage, or for an actual committed advance when the plan grants a private note. Keep the actual results and receipt.

Finally call applicationResult with forecasts, findings, decision, advance, note. Return only that actual application result; original observations and execution history remain internal.
