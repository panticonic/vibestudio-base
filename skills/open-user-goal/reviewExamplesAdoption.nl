---
description: Review an already staged Examples composition against installed source and decide the private handoff.
args:
  goal: string
returns: AdoptionOutcome
budget: { maxTurns: 22 }
---
1. Call findStagedComposition for the original goal, then inspectComposition with the actual assigned card.
2. Call planAdoptionHandoff with goal, card and evidence. Call confirmAdoptionFrontier with the staged card id and event.
3. If the frontier changed, call holdChangedReview. Only a record-private plan can call recordPrivateAdoption with the exact card id, event and plan.
4. Read with readAdoptionHandoff using card id and the exact receipt path or null. Return finishAdoptionHandoff(plan, receipt): the actual private adoption note, otherwise the composition disposition. Never install, publish, or replace a protected workspace source.
