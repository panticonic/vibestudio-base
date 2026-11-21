---
description: Verify the approved effect and basis immediately before native publication.
args:
  assignment: SurfaceAssignment
  approval: SurfaceApproval
  replay: SurfaceReplay
  decision: SurfaceDecision
returns: SurfaceReceipt
---
Return transcriptMutation.apply(assignment.id, approval.id, replay.cursor, decision.effect).
