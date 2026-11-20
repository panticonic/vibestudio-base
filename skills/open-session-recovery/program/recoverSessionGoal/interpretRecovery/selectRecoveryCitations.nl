---
description: Bind a recovery disposition to the exact retained notes that substantiate it.
args:
  goal: string
  disposition: Disposition
  windows: RecoveryWindow[]
returns: RecoveryNote[]
---
Select the exact retained notes that establish the answer. Preserve their channel, message ID, sequence, and text unchanged. Cite each distinct governing source when the question depends on comparing copies or decisions. Return them in request order by source and chronological order within a source. Use an empty list when no retained note can substantiate the decision.
