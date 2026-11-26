---
description: Determine whether the original settled result is eligible for original artifact readback.
args:
  scope: SpecialistScope
  participantId: string
  selected: "{ attempt: SpecialistRow | null; result: SpecialistRow | null }"
returns: ReceiptJoin
---
Copy exact attempt and result message IDs when available. A missing attempt means awaiting-settlement. A different attempt task, context, channel or participant means wrong-scope. For an exact attempt, cancelled means cancelled-attempt, failed means failed-attempt and running means awaiting-settlement. A completed attempt with no matching original result is unlinked-result. Check the result's exact task, context and participant; mismatches mean wrong-scope. Check both attempt and result provider against the assigned provider; mismatches mean provider-mismatch. Check both observed parent revisions against the assigned current base; mismatches mean revision-drift. A result without a committed source event is source-uncommitted. Otherwise verified permits narrow exact artifact readback.
