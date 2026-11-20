---
description: Verify the exact retained specialist result and decide an authorized local integration handoff.
budget: { maxTurns: 30 }
args:
  goal: string
returns: SpecialistGoalReport
---
1. Discover the current specialist index and chooseCurrentSpecialist for the user's goal. If it names a handle, call agents.manageChannelAgent with the exact goal, channel, context, handle, action inspect and null options. Keep the exact request and returned membership report. Otherwise keep null membership.
2. Read the owned retained frontier twice. Call checkSpecialistReceipt with the choice, current frontier and exact membership. If verified, use workspace.readOriginalSpecialistArtifact with its exact result message. If the original is present call reviewSpecialistHistory with that result record and original bytes.
3. Call decideSpecialistHandoff with the exact evidence and unchanged goal. If the plan says stage and the history review exists, call workspace.stageSpecialistHandoff once. Return the actual plan, membership with the exact request and report or null, unchanged history witness or null, and actual local receipt or null.
