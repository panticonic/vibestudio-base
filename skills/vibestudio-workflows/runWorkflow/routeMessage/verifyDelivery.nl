---
description: Assess actual local delivery evidence against the resolved audience and composed message.
args:
  request: MessagingRequest
  decision: Decision
  draft: Draft | null
  receipt: Receipt | null
  observed: DeliveryEvidence
returns: Verification
---
1. For hold, require no receipt, no observed task message and no committed send. Explain the unresolved recipient and retain missing evidence as an open question.
2. For deliver, compare the real message id and channel to the receipt, the observed exact recipient ref to decision.ref, and the observed text to draft.content. Check all supplied facts remain present and faithful. A shared channel log can be visible to other participants; claim only actual addressed routing, not private log visibility.
3. Return passed only when actual evidence supports that branch. You receive typed data and have no live send/read capability. The independent fixture oracle verifies routing and absence after the canonical delivery boundary.
