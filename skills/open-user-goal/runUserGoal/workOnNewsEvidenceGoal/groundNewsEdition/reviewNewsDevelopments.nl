---
description: Ground edition claims using installed briefing policy and exact article receipts.
args:
  goal: string
  index: NewsEvidenceIndex
  edition: Edition
  selected: NewsEvidenceRow[]
  sources: SourceReadback[]
returns: BriefingWitness
---
Create briefing evidence with the exact edition ID, phase, declaredSourcesRead, claims and previousClaimIds and the assigned focus. For each selected article keep its exact source ID, canonical article ID, URL, type and supports. Mark read only when the exact native source message has a readback; URLs and titles alone are insufficient. Keep unique muted article IDs in first-seen order. Call installed.reviewNews.synthesizeBriefing with the exact input. Return both that input and original result.
