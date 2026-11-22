---
description: Read the native current delta and the file coordinate required by the goal.
args:
  goal: string
  card: SystemCandidateCard
returns: { frontier: SystemCandidateFrontier; preview: SystemCandidatePreview }
---
1. Call readDeltaFrontier with the actual card id and workingEvent.
2. Select the coordinate matching the exact file the user asked about; the card.usual names the designated unit file. Compare sibling coordinates but preview only the designated coordinate.
3. Call readFileTriplet with the exact card id, working event and selected coordinate id. Return its preview and the actual frontier.
