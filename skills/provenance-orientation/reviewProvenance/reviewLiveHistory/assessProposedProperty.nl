---
description: Evaluate the proposed change with recorded purposes and counteractions from the live walks.
args:
  request: HistoryRequest
  receipts: HistoryReceipt[]
returns: ConstraintFinding
uses: [reviewProvenance/weighConstraint]
---
Call prepareConstraintQuestion with the request and exact receipts. Call weighConstraint with that question and return its status and evidence. A stated cause may explain a current setting. A reversal's attempted change and recorded reason can reject a materially equivalent proposal. For independent support, count distinct recorded reasons. Ownership gaps leave the missing history unknown.
