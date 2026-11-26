---
description: Investigate the exact owned release attempt and relevant retained cases without creating a handoff.
args:
  goal: string
returns: SystemReleaseInvestigation
---
Use discoverRelease and compareRuns to establish the assigned scope and current/earlier native attempt facts. Determine which evidence is admissible for the user's actual question; an earlier attempt is usable only under the explicit same-build continuity grant, never instead of a current terminal failure. If no run is admissible, preserve the actual blocker and return no case review.

Use evaluateCases for the selected retained attempt when its cases are needed to answer the goal or substantiate a requested handoff. Ground the assessment in the actual primary failure, durable confirmation and cleanup facts rather than visible pass counts. Return the exact assignment, comparison and optional evaluated cases. This investigation reads retained evidence; it does not rerun tests or stage a note.
