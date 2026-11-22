---
description: Resolve current authority and the exact approved target among competing records.
args:
  assignment: SurfaceAssignment
  approvals: SurfaceApproval[]
returns: SurfaceSelection
---
1. No publication authority means approval null and blocker authority.
2. Consider only approved candidates matching the channel, subject, and exact revision in the assignment.
3. Zero matches means blocker missing. More than one means blocker competing. Exactly one means approval is that record and blocker is null.
