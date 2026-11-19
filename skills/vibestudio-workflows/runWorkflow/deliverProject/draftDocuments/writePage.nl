---
description: Compose a usable page from supplied facts for its actual reader and role.
args:
  request: ContentRequest
  brief: Brief
  page: PagePlan
returns: Draft
---
1. Read the requested purpose and its assigned factIds. Use only supported facts, preserving exact values, conditions, ordering and ownership where supplied. Additional explanation must not introduce new factual claims.
2. Write useful Markdown for request.audience. For each supplied factual statement cite its exact source id as [fact:ID]. Separate conditional actions and prerequisites; do not claim any action has already succeeded.
3. Return page.path and finished content. Use relative links only to actual planned project material; source citations refer to the immutable sources.json ledger that the host writes. No repository manifests or authority configuration belong in this page.
