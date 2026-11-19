---
description: Recheck the destination audience and head against the preview before revealing source contents.
args:
  request: TemplateTransferInput
returns: "review-audience" | "refresh-head" | "ready-to-copy"
---
If the audience was not reviewed or is no longer current, return review-audience. Otherwise if destination head is no longer current, return refresh-head. Otherwise return ready-to-copy. Verification uses the actual destination receipts in the request.
