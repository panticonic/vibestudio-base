---
description: Resolve a website publication review, lost-operation check, or prior review decision in the current workspace.
args:
  goal: string
returns: PublicationGoalReport
uses: [preflightPublication, reviewPublicationRevision]
budget: { maxTurns: 24 }
---
1. Read publicationGoal.discover. Ask choosePublicationScope to select the exact destination and work needed for the goal from the current observation.
2. If no scope is justified, return blocked and explain the missing target or evidence. Otherwise pass the observed revision and choice to publicationGoal.bind. If binding fails, rediscover once and reconsider on the fresh evidence.
3. For a bound revision request call reviewPublicationRevision. For a bound preflight request call preflightPublication. Preserve both when the user needs the package review and the prior decision. Return the exact chosen scope and actual results, using null for an unrequested check. Treat a local review and journal state as their observed dispositions.
