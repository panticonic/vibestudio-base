---
description: Discover, diagnose, repair and conditionally roll out a unit in an owned disposable workspace context.
budget: { maxTurns: 22 }
args:
  goal: string
returns: UnitRolloutReport
---
1. Call unitRolloutCatalog.discover, then chooseUnit with the goal and visible unit list. If it cannot select one exact unit, return held with null identities and a specific reason.
2. Call inspectUnit with the goal and unit id. Keep its live observation and any requested check. Ask decideNext what the user authorizes and which evidence is still needed.
3. For an authorized repair, call evolveCandidate with the goal, current stage, and earlier findings. Ask decideNext about its returned stage. If the current evidence shows a newer revision, pass the fresh stage and the previous findings to a new repair call only when a justified patch is still necessary. The caller can support up to two new repair proposals after the first.
4. For commit, call commitCandidate with the exact verified revision only after a current successful complete check and explicit user authorization. If it returns changed, call inspectUnit on the same unit and reconsider against the new observation. Preserve the coedit; commit only the newly observed, verified revision when the goal still supports it. A stale result cannot establish a release.
5. Return repaired for a successful working-source repair kept local, committed for a matching returned local event, verified for a healthy requested check with no edit, or held for a remaining blocker or missing authorization. Include the exact unit id and latest observed revision, actual check, actual release receipt or null, and a precise reason. For committed, take revision from the returned event receipt and keep the check at its original verified working revision. Never claim that a failed build, skipped tests, or an unverified event is ready.
