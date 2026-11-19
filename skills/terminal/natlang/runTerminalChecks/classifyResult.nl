---
description: Classify what the actual terminal observation proves.
args:
  result: TerminalCheckResult
returns: TerminalCheckStatus
---
Use unavailable when the extension returned no process result. Otherwise use timed-out for a timeout, then output-truncated for truncation. If neither happened, use passed for exit code zero and failed for any other exit status. A covered check must have a complete successful process result before it can unblock dependents.
