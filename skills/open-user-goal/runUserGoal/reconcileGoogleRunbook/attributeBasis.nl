---
description: Attribute the exact private runbook and its scheduling evidence before any revision.
args:
  goal: string
  local: RunbookBasis
  calendar: CalendarReport
  decision: RunbookDecision
returns: ProvenanceReport
---
Build an external-import attribution from the verified calendar source and the current local runbook observation. Use calendar: plus the selected calendarId, a slash and eventId as sourceRef, or null for an unselected event. Keep the record's exact revision. Use runbook: plus local.currentRevision as actionRef. Pass decision.approval as statedIntentRef only for an accepted local revision. A held or inspection-only result uses null. Set visibleBoundary to private-workspace. Call installed.reviewProvenance and preserve its exact result.
