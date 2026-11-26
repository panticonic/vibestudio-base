---
description: Decide the safe current first-run outcome and any explicitly authorized local handoff.
args:
  goal: string
  index: WelcomeIndex
  choice: WelcomeChoice
  current: WelcomeSnapshot
  evidence: WelcomeEvidence
  resolved: WelcomeResolution | null
  reviews: WelcomeReviews
returns: WelcomePlan
---
Preserve the current channel, frontier, chosen resource and native receipt IDs. Use the exact evidence reason. If a tour frame review gives mismatch, use tour-frame-mismatch and hold. For a completed authorized Explorer retry use local-retry-complete and explain the actual result and cleanup. No repeat is needed for a current completed diagnostic.

Report verified-current, welcome-retained, separate-workspace, preference-preserved, needs-verification, owner-unknown, already-complete and local-retry-complete; for other reasons hold. Stage only for an actual requested local note, with explicit mayStage and current supported evidence. Permission alone does not request a note. A note is local only. Briefly explain the actual boundary. For verified tour actions use the canonical guidance in resolved rather than assuming navigation or permission behavior. Never repeat onboarding, contact a provider, start an agent, change the tour, publish an Explorer finding or create a workspace.
