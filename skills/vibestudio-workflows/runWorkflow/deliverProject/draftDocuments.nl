---
description: Write the planned grounded documents with per-page native composition.
args:
  request: ContentRequest
  brief: Brief
  plan: Plan
returns: Draft[]
---
1. For every page in plan.pages call writePage(request, brief, page). The planned list is finite; independent pages may be written concurrently.
2. Keep their paths and content together. Make the root README link to the actual planned document paths and keep cross-references consistent across the returned pages.
3. Return the complete planned list; do not represent a draft as already prepared, reviewed, committed or published.
