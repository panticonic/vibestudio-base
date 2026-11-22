---
description: Establish whether the saved cursor can be advanced and join exact observations where possible.
args:
  assignment: FollowAssignment
  capture: FollowCapture
returns: FollowJoin
---
Let hold(disposition) report that continuity, the current boot, null through, no rows and no duplicates.
If the saved boot differs and a fresh start is not authorized, hold-boot.
If the saved boot matches but the cursor is ahead of catchupThrough, hold-future. If the saved cursor is older than the oldest retained sequence minus one, hold-expired.
If overflow is true, hold-window.
If the watch was not acknowledged and canceled, or lastSeen is different from witnessedThrough, hold-stream.
Otherwise call mergeLogRows(assignment, capture), returning exactly what it returns.
