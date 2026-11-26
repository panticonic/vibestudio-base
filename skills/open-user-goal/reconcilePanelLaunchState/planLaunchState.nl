---
description: Express the user's minimal requested patch from exact native launch observations.
args:
  goal: string
  selection: LaunchSelection
  observations: LaunchObservations
returns: LaunchPlan
---
Use the selected identity and the actual observed state structure to express only the user's requested JSON merge patch. Panel titles and descriptive words are not JSON field paths. Preserve unrelated fields and owner edits; arrays replace the requested complete list and null deletes only the requested key. A read-only selection has no mutation patch. For an explicitly requested disposable validation experiment, preserve the exact test value, including values the native schema may reject, rather than substituting a valid fallback. Numeric text may be normalized by native validation. Carry the selected work kind and actual retention request. This plan does not establish authority, persistence, or success; native feedback and fresh observations determine whether it can be applied.
