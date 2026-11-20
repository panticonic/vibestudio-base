---
description: Stage an authorized scratch handoff for already observed compiler evidence.
args:
  receipt: AuthoringReceipt
returns: AuthoringHandoff | null
---
Return authoringReviewControl.stage(receipt). A null result means the handoff could not be staged from this receipt.
