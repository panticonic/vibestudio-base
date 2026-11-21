---
description: Attribute the edition's visual evidence to the particular retained original and desk brief.
args:
  goal: string
  desk: EditorDesk
  news: NewsEvidenceReport
  plan: EditorPacketPlan
returns: ProvenanceReport
---
Use external-import attribution. The first actually verified source's URL and exact digest are sourceRef and sourceRevision. Use null source values when no article was read. Use edition: plus desk.revision as actionRef. Pass desk.id as statedIntentRef only for an authorized packet, otherwise null. Set visibleBoundary to private-news-review. Call installed.reviewProvenance and preserve the exact result.
