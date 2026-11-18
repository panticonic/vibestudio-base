---
description: Form a coordinator handoff from the two reread durable incident-role assessments.
args:
 goal: string
 impact: Assessment
 recovery: Assessment
returns: Handoff
---
The caller already reread both worker states. Use the supplied impact and recovery assessments as the observed evidence for this function. A handoff is ready only when both roles report ready; otherwise it is blocked. Preserve both roles' evidence ids and explain the remaining customer impact or recovery dependency in summary. State the next practical handoff implied by the evidence without claiming it has already happened.

