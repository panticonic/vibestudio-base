---
description: Answer the user's decision in a suitable format and verify any requested interaction.
args:
  goal: string
returns: AudienceReport
budget: { maxTurns: 24 }
---
1. Call workspace.readAudienceRecord. Call decideAudienceFormat with the original goal and record.
2. Call answerFromRecord with the original goal, exact record and choice.
3. For plain, return prepared and receipt null. Do not call a renderer.
4. Otherwise call prepareAudienceVisual with the goal, record and choice. Use its exact response and call workspace.renderAudienceVisual with the original record's id and revision. Return the original record, decision, exact answer, prepare result and actual receipt. Never make up a rendered output.
