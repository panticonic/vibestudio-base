---
description: Choose the safe next step from the user's intent and the actual continuity evidence.
args:
  goal: string
  profile: MobileContinuityProfile
  evidence: MobileContinuityEvidence
returns: { action: "resume" | "rebuild-shell" | "reacquire-route" | "hold"; reason: string }
budget: { maxTurns: 14 }
---
1. Hold when exact device/app/build authority has failed, trust has been revoked, the reconnect changed authenticated server, the workspace connection is closed, a structured failure is nontransient and asks for automatic retry, or the user wants actual-device proof. Say which original issue blocks handover.
2. Distinguish the cache from current authority. A cold recovery or a missing/rejected same-scope cache may require rebuilding the shell before claiming continuity. Never reuse a different device or workspace snapshot.
3. Compare the requested slots with native lease readback. A slot without a lease can be reacquired if the caller allows it. A foreign lease or actual release of the selected route is not owned. Do not take over another presentation. A late release for an older runtime or connection does not invalidate the current one.
4. For a healthy selected scope, continue from retained authority and report the exact issue that matters to the user. Never claim physical mobile execution from this local replay.
