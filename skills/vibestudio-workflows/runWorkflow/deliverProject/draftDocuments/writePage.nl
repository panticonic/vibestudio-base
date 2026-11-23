---
description: Compose a usable page from supplied facts for its actual reader and role.
args:
  request: ContentRequest
  brief: Brief
  page: PagePlan
returns: Draft
---
The supplied request.facts, brief and page are this composition step's evidence and plan. Compose from these values; the caller owns source discovery, project preparation and writes. Return a Draft rather than performing those stateful operations.

1. Read the requested purpose and its assigned factIds. Use only supported facts, preserving exact values, conditions, ordering and ownership where supplied. Additional explanation must not introduce new factual claims.
2. Write useful Markdown for request.audience. Ground factual statements in request.facts. Give clear attribution when useful or requested; no particular inline citation syntax is required. Separate conditional actions and prerequisites; do not claim any action has already succeeded.
3. Return page.path and finished content. Use relative links only to actual planned project material; the native writer retains an immutable sources.json ledger for exact provenance. No repository manifests or authority configuration belong in this page.
