---
description: Discover and read public sources to answer a question the user asked.
budget: { maxTurns: 32 }
args:
  goal: string
returns: ResearchGoalReport
---
Determine what public evidence would answer the user's question. Read goalDiscovery.snapshotTime once and pass the original goal, an empty source list and that timestamp to sources.researchBrief. Its hierarchy chooses search or direct authority reading, checks quotations and reconsiders incomplete evidence.

Inspect the answer against every material part of the goal. If more investigation is needed, use the available public discovery service or another invocation of the research hierarchy to pursue the missing evidence. Search success is not a prerequisite for reading a public source. Preserve the original question, the same timestamp, exact citations and actual unanswered parts. Return the grounded result; never replace unavailable evidence with a remembered answer or an unsupported claim. Only use the public session.
