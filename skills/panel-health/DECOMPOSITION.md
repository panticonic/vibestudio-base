# Live panel health review

The caller assigns one live VibeStudio panel and the visible outcome it should
reach. The workflow reviews its current renderer, DOM and console evidence.
A later observation can confirm recovery when it belongs to the same panel
and carries the required newer evidence.

| Responsibility | Natlang stage | TypeScript mechanism |
| --- | --- | --- |
| Capture the assigned panel | Read a bounded observation and retain the exact evidence identity. | Resolve the owned panel, read its diagnostic packet and perform a read-only CDP query. |
| Interpret visible behavior | Compare readiness, labels and state markers with the requested outcome. | Project the exact DOM fields the caller asked to inspect. |
| Attribute console signals | Consider each diagnostic in the observed renderer, and honor explicit baseline allowances. | Return the retained console sequence, lost-record count and immutable attempt identity. |
| Confirm recovery | Require a later valid observation and the actual corrected browser state. | Capture a second observation within the same assigned runtime scope. |
