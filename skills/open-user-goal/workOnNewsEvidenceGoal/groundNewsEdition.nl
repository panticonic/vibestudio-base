---
description: Load the current edition and reconcile its original concrete article evidence.
args:
  goal: string
  index: NewsEvidenceIndex
  topic: string
  current: NewsEvidenceSnapshot
returns: "{ briefing: BriefingWitness | null; sources: SourceReadback[] }"
---
1. Choose the last edition for the exact topic. If none exists, return no briefing and no source readbacks.
2. Call selectNewsSources with topic, index and current frontier. For each returned row in native order, call workspace.readNewsArticleBytes with the exact IDs. Keep only nonnull exact readbacks in sources.
3. Call reviewNewsDevelopments with the edition, selected rows, original readbacks and current goal and scope. Return that review and exact sources. Keep old claims, new developments, same canonical URLs and muted sources distinct. Only use article content as evidence.
