---
description: Select a verified finding or explain the exact retained evidence gap.
args:
  goal: string
  focus: IncidentFocus
  current: IncidentAssessment | null
  baseline: IncidentAssessment | null
returns: IncidentDisposition
budget: { maxTurns: 10 }
---
1. If there is no approved current checkpoint, return finding held and blocker no-approved-current-checkpoint. Explain the actual problem with the saved evidence in the context of the goal.
2. If focus is runtime-memory, return held and wrong-measurement-boundary. A native compile, even a failed one, does not measure the requesting process tree or establish the cause of memory pressure.
3. A comparison requires two successful profiles from the same unit at the exact requested revisions. If their build cache classes differ, describe the different classes and avoid claiming a causal or like-for-like runtime speedup. If a required baseline is absent or unusable, return held and no-comparable-baseline.
4. A failed build may support a compiler finding with a concrete diagnostic, but it cannot establish completion, performance or cache reuse. For other focuses on that failed build, return held with native-build-failed. Report exact affected source when describing a compiler failure.
5. Otherwise return the requested finding for this measured boundary and null blocker. Ground your explanation in the actual first-run class, exact cache keys, phases or initial payload as appropriate. Keep emitted, lazy and source bytes distinct. For compare, describe both native observations and preserve the version distinction.
