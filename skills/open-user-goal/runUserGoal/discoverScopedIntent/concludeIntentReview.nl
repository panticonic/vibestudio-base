---
description: State the evidenced answer and any separately missing facts.
args:
  goal: string
  plan: IntentPlan
  evidence: IntentObservation[]
returns: IntentOutcome
---
Use observed for complete evidence, unavailable when everything relevant was missing, and partial when some requested observations were missing. Read a confirmed empty note as a real empty result. An installed guide does not establish a running instance, and an exact local helper does not establish whether working edits are committed. Summarize confirmed facts and relevant gaps from the actual results. Do not infer unobserved activity.
