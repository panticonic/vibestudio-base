---
description: Plan a coherent grounded project information architecture.
args:
  request: Request
  brief: Brief
returns: Plan
---
1. For each requested document role, decide where its reader should find that information and why. Choose meaningful relative Markdown paths under docs/ and a root README.md that explains the project and links to the documents.
2. Assign supplied fact IDs to pages where they support the purpose. Cover all request.facts across the finite set of pages. Preserve sequence for ordered work and distinguish independent work from prerequisites.
3. Return each page path, requested role, factIds and purpose. Do not generate duplicate paths or include machine manifests or source ledgers as prose pages. Return a blocker rather than invent missing necessary evidence.
