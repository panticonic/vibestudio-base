---
description: Investigate the requested adoption facts while preserving actual installed, staged and retained evidence roles.
args:
  goal: string
  card: AdoptionReviewCard
  previous: "AdoptionEvidence | null"
returns: AdoptionEvidence
---
Choose the actual native observations needed to settle this question. Installed provenance and staged composition have different roles: one describes the retained installed unit, the other runs the native ownership, source, manifest and package-closure mechanisms at card.event. Independent reads may be composed together; preserve an explicit user ordering when one was requested. Keep previous actual observations when refining, refresh relevant evidence when needed, and leave an unobserved role null. Do not fill an unread role from a title, permission or predicted fixture result. Return the real observations for the caller's continuation; do not write here.
