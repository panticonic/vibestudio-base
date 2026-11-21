---
description: Review the authorized visible surface in the exact current workspace transcript.
args:
  goal: string
returns: TranscriptSurfaceReport
budget: { maxTurns: 45 }
---
1. Discover the user goal and approved workspace scope with discoverTranscriptSurface().
2. Use reviewApprovals(assignment), then selectApprovedSurface(assignment, approvals).
3. If the selection contains a current approved surface, read inspectNativeSurface(assignment, selection.approval). Otherwise replay is null.
4. Decide the necessary native transcript effect with decideTranscriptEffect(assignment, selection, replay).
5. Apply a non-none effect only with materializeTranscriptEffect(assignment, selection.approval, replay, decision). Always keep its exact receipt, including a stale outcome. Otherwise receipt is null.
Return assignment, approvals, selection, replay, decision and receipt.
