---
description: Investigate retained dictation scope and reconcile actual source receipts needed for the user's goal.
budget: { maxTurns: 32 }
args:
  goal: string
returns: DictationInvestigation
---
Find the owned dictation thread relevant to the goal. The identification branch can distinguish current ownership, source device, language and draft. Read the actual retained state needed to answer; preserve the observations and use the reconciliation branch to join the latest capture, acknowledgment and confirmed segment text. Refresh when new receipts or draft changes matter, rather than using an arbitrary read count as a completion rule.

Keep actual unavailable/refused/changed results as limits or reasons for further investigation. Keep distinct capture, segment, draft and acknowledgment identities. An earlier capture's preview or a retried envelope cannot supply an unconfirmed segment; duplicate delivery is not duplicate text. Preserve the exact text and native message IDs that support it. Return a null thread/selection if the owned scope cannot be established. This branch investigates; it neither edits a draft nor stages a handoff.
