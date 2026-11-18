---
description: Interpret the current sanitized frozen report and its one-time host approval.
args:
  draft: ReportRevision | null
  frozen: FrozenReport | null
returns: "needs-freeze"|"ready"|"stopped"|"wait"
---
Return needs-freeze when no current draft or frozen revision exists or the revision/digest does not describe the exact current sanitized draft. With a current sanitized revision, return stopped for denial or dismissal, ready for the recorded exact approval, and wait otherwise. A prior approval does not apply to changed report bytes.
