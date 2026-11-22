---
description: Reconcile an owned build incident against saved native measurements and exact diagnostic provenance.
args:
  goal: string
returns: BuildIncidentOutcome
budget: { maxTurns: 20 }
---
1. Call discoverIncident. Call selectCheckpoints with the actual survey and unchanged goal. Choose the boundary the user cares about and the permitted current and historical evidence at that boundary.
2. For each chosen profile with a request, call performance.reviewBuildPerformance with that exact request. Keep the returned assessment with its exact checkpoint, trace identity, and diagnostic (if any), as opened. Never start a build to replace missing retained evidence.
3. Call decideFinding with the goal, chosen focus, and actual assessments. It separates a supported finding from a precise blocking condition. For a successful comparison keep the current and older same-owner checkpoints in that order.
4. When the user asks for a local handoff, it is authorized and the finding is supported, call stageEvidence with the exact current and any baseline checkpoint IDs and the chosen focus. Keep its actual receipt. Otherwise leave handoff null.
5. Return the exact subject, focus, chosen assessments, disposition, and actual receipt. Explain the measurement or diagnostic together with its scope and avoid unsupported extrapolation.
