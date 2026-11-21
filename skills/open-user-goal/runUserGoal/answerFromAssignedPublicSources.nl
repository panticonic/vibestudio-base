---
description: Resolve a user's decision from the public URLs they actually supplied and preserve the installed brief's evidence.
args:
  goal: string
returns: AssignedPublicGoalReport
budget: { maxTurns: 12 }
---
1. Call selectAssignedSources with the original goal. Keep the exact public URLs in their supplied order.
2. Call publicBrief.bind with that list and pass its exact request to webResearch.writeAssignedBrief. A refused assignment is held without a brief. This route uses the user's source list.
3. If the installed brief substantiates the question, return decision supported with that exact brief. Otherwise return held and preserve the brief's unsupported finding. Do not add any claims, mutate an artifact, or use other sources.
