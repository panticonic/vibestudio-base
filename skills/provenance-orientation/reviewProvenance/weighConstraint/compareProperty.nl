---
description: Identify the shared constraint across VCS causes, semantically related choices, and recorded reversals.
args:
  property: string
  facts: ProvenanceFact[]
returns: EvidenceVote
---
Consider disclosed facts only. Compare the underlying property, even when rejections refer to another component. Collect independent refs that support the property, refs that conflict, note refs that are historic assumptions, and rejection refs that explicitly reject the proposed property or a materially equivalent change. Use purpose only from stated or trigger evidence. Use mechanical facts for effects only. A note alone cannot establish the current rule.
