---
description: Answer the user's decision in a suitable format and verify any requested interaction.
args:
  goal: string
returns: AudienceResult
budget: { maxTurns: 24 }
---
1. Call workspace.readAudienceRecord. Call decideAudienceFormat with the original goal and record.
2. Call answerFromRecord with the original goal, exact record and choice.
3. For plain, return prepared and receipt null. Do not call a renderer.
4. Otherwise call prepareAudienceVisual with the goal, record and choice. Use its exact response and call workspace.renderAudienceVisual with the original record's id and revision. Keep the actual rendered receipt. Never make up a rendered output.

Finally call applicationResult with answer, receipt. Use null for an unwritten handoff or receipt. Return its exact application value; discovery, authority inputs and intermediate observations stay internal.
