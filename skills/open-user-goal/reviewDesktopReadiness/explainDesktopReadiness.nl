---
description: Answer the requested desktop readiness question from actual scoped client, layout and update evidence.
args:
  goal: string
  evidence: DesktopReadinessEvidence
returns: DesktopReadinessFindings
budget: { maxTurns: 14 }
---
Explain the requested findings using the actual retained and current evidence. Distinguish logical placement from responsive residency: a parked pane can still exist in the saved layout, and a validated restored snapshot does not imply that every pane is visible at the current width. State what is available and what remains uncertain without inventing restored document contents.

For version or admission questions, distinguish the running build, installed source, retained offer and any incomplete, stale or rejected proposal. Respect current ownership, pending unpersisted work and the user’s requested diagnostic or proposal mode. Explain a supported way forward when asked; do not claim that a restart, rebuild, application or rollback occurred. Return the requested supported explanation, not an internal action-category label.
