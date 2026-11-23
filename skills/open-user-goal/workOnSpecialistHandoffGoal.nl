---
description: Verify the exact retained specialist result and decide an authorized local integration handoff.
budget: { maxTurns: 30 }
args:
  goal: string
returns: SpecialistResult
---
1. Discover the current specialist index and chooseCurrentSpecialist for the user's goal. If it names a handle, call agents.manageChannelAgent with the exact goal, channel, context, handle, action inspect and null options. Keep the exact request and returned membership report. Otherwise keep null membership.
2. Read the owned retained frontier twice. Call checkSpecialistReceipt with the choice, current frontier and exact membership. If verified, use workspace.readOriginalSpecialistArtifact with its exact result message. If the original is present call reviewSpecialistHistory with that result record and original bytes.
3. Call decideSpecialistHandoff with the exact evidence and unchanged goal. If the plan says stage and the history review exists, call workspace.stageSpecialistHandoff once. Keep the exact plan, membership, history and actual receipt.

Finally call applicationResult with plan, the actual membership witness, history, and handoff. Return its exact domain result; repeated review requests and native observation audit stay internal.
