---
description: Select the actual native file coordinate relevant to the requested comparison.
args:
  goal: string
  card: SystemCandidateCard
  frontier: SystemCandidateFrontier
returns: SystemCandidateCoordinate | null
---
Interpret the requested file or capability against this actual owned frontier. Select a real coordinate whose path and native unit match the request, using the card’s designated file as contextual evidence when relevant. Similar names do not establish equivalence. Return the original matching coordinate, or null when the available evidence cannot identify it. This is a value-producing choice; it performs no reads, writes or candidate changes.
