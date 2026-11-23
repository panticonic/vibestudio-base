---
description: Reconcile a Google Workspace Calendar decision and apply a minimal change to the private local runbook when the current records agree.
args:
  goal: string
returns: GoogleRunbookResult
budget: { maxTurns: 26 }
---
1. Call googleRunbook.read to retrieve the current local runbook and approval documents. Read the selected Calendar through reviewCalendar with the actual user goal and local records.
2. Call reconcileApproval with the goal, records and exact Calendar report. Resolve the target and terms from the visible evidence. A stale event, withdrawn owner decision, ambiguous runbook or conflicting approved instructions means hold.
3. Call attributeBasis with the local observation, Calendar and decision. Preserve its exact attribution in the outcome. When the local draft is authorized and its conditions are satisfied, call reviseRunbook with the goal, exact Calendar report, original records and decision. Return the actual runbook decision, working-copy receipt and attribution. The verified Calendar evidence remains internal to the reconciliation.
4. Otherwise return held or review-only as appropriate, with the actual decision reason, attribution and null write. Never change the event or send anything.
