---
description: Recover an approved immutable archive into an existing owned working project.
args:
  goal: string
returns: ContentArchiveOutcome
budget: { maxTurns: 25 }
---
1. Discover the actual assignment. Call inspectArchive with it to examine the working project and two scoped archive coordinates.
2. Call chooseEdition with the actual assignment and observation. Call planRestoration with those values and its choice. Preserve the actual choice and plan.
3. For a restore plan only, call applyArchive with the actual assignment, observation, selected archive and plan. Retain its exact receipt. If it reports a changed state, stop with the actual newer observation.
4. Return action, reason and actual receipt or null. No additional file edits or publication.

Return the actual restoration receipt or null, action and concrete finding. Keep archive observations and the addressed-path plan in working calls.
