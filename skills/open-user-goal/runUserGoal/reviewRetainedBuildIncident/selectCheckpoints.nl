---
description: Resolve the requested performance boundary and select only usable owned checkpoint scopes.
args:
  goal: string
  survey: IncidentSurvey
returns: IncidentSelection
budget: { maxTurns: 12 }
---
1. Decide whether the question concerns build time, initial payload, cache, a compiler error, comparing two revisions, or runtime memory. Build wall time and emitted/source bytes do not measure runtime memory.
2. Find a completed released checkpoint for the exact subject source, owner and current revision. A same-named sibling or earlier revision is insufficient. Use openCheckpoint for that card if present.
3. For a comparison, also find the applicable earlier completed and released checkpoint from that same source and owner. Use openCheckpoint for it. If either required coordinate is absent, return null for that input. Reports on rejected checkpoints must not run through the performance reviewer.
