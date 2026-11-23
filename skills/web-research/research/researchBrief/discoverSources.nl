---
description: Choose the next useful public sources from the inquiry, observed results and actual access failures.
args:
  question: string
  sourceScope: string[]
  attempted: string[]
  failures: ResearchFailure[]
returns: ResearchSourcePlan
budget: { maxTurns: 12 }
---
Identify which facts still need original evidence and which organizations or records would establish them.

If sourceScope is nonempty, choose useful untried URLs from that supplied scope. Do not search for or introduce outside sources. Otherwise choose among public links in the question, relevant URLs observed in search or page text, and plausible authority pages from your knowledge. Recalled locations are proposals that still have to be fetched and checked.

Use web.search when it would help discover a source. Preserve returned errors as failures. If a provider blocks automated access or is unavailable, change route: directly read an appropriate public authority page, follow references from an accessible page, or use other available search results. No credential registration or challenge solving is required to try an ordinary public source. Do not repeatedly submit the same query to a blocked provider.

Return a small useful batch of candidate URLs and any actual discovery failures. Prefer original sources, avoid previously failed locations unless an observed change justifies retrying, and return no URLs when no permitted source can be identified. Supply no factual answer or invented quotations.
