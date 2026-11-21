---
description: Invoke the installed presentation workflow only when a visual serves the goal.
args:
  goal: string
  record: AudienceRecord
  choice: AudienceChoice
returns: AudiencePrepared
budget: { maxTurns: 12 }
---
Call visualize.preparePresentation with the unchanged goal and exactly record.sections. Keep the returned presentation unchanged. For catalog use modelId null. For calculator use the exact record.model.id only if the installed result defers the Calculator view and the recorded bounded model is present. Otherwise modelId is null. Return the exact presentation and modelId.
