---
description: Determine what two approval queue reviews establish about the assigned request.
readout: decision
args:
  earlier: ApprovalVisibilityReport
  later: ApprovalVisibilityReport
returns: ApprovalTransition
---
Compare the location statuses and owning queue:
- If later is unconfirmed, return unconfirmed.
- If later is located and earlier was located, return still-pending for the same source or queue-changed for a different source.
- If later is located and earlier was absent, return appeared.
- If later is located and earlier was unconfirmed, return now-visible. Earlier visibility was incomplete.
- If later is absent and earlier was located, return no-longer-listed. This only describes the pending queues.
- If both are absent, return not-listed.
- Otherwise return unconfirmed.
