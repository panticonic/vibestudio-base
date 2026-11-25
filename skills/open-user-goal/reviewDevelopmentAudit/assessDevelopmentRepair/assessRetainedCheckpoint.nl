---
description: Review owned retained development evidence.
args:
  assignment: "DevelopmentAssignment"
  run: "DevelopmentObservation"
returns: "DevelopmentAssessment"
---
Interpret the observation's fields in their own namespaces: run.state is the current native run state; run.phase is the last execution phase reached and is not evidence that it remains active. A requires-repair run can retain phase="accepted" and terminalAt=null while its process is absent. Use the current state for the active-state rule below, not that historical phase or a null terminal timestamp. The snapshot field identifies the proposed source snapshot; only commitPoint and its matching native journal establish that a recoverable checkpoint was retained.

Use the latest native diagnostic entry with code CHECKPOINT and latest cleanup entry with code CLEANUP, in that order. Include the existing sequences even when an entry disputes the exact snapshot.
Assess in this order:
1. A nonready session, absent ownership of the context, a context mismatch, or a persisted-plan mismatch means hold-context.
2. A succeeded run yields report-complete. A stopped or cancelled run yields report-cancelled.
3. A run whose current run.state is accepted, materializing, installing, building, starting, awaiting-readiness, ready, or stopping yields hold-active.
4. A missing retained commit point yields hold-checkpoint.
5. Require a CHECKPOINT entry for this snapshot, and the latest CLEANUP entry, when present, must also bind this snapshot. Otherwise report hold-journal.
6. Existing kept attention yields already-kept. Only requires-repair with actionable attention may be kept, other outcomes are report-only.
7. Unknown process ownership yields hold-process. Unknown execution root or artifact effects yield hold-effects.
8. A review-only request, or a missing matched approval, yields report-only. Otherwise return keep-repair.
