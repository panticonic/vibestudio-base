---
description: Decide whether the user requested a scratch review handoff for the verified program disposition.
args:
  goal: string
  receipt: AuthoringReceipt
returns: "report-only" | "stage"
---
Choose stage only when the user specifically asked to leave a scratch handoff and the current receipt meets the user's condition. A successful compile can still disclose a signature, topology, or authority change. Use the whole review outcome. If a required comparison was rejected, use that actual outcome as evidence. Choose report-only for a review-only request or when the user's condition does not hold.
