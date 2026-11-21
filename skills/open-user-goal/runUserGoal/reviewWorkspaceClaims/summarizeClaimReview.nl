---
description: Explain the supported part of a claim packet and the exact gap for the claims that remain open.
args:
  goal: string
  packet: ClaimPacket
  evidence: ClaimEvidence
  support: ClaimSupport
returns: ClaimDisposition
---
Use confirmed when every stated claim is supported, unconfirmed when none is, and partial otherwise. Summarize the strongest relevant confirmed evidence and distinguishing gap without extending a local test's claims to another candidate, live panel, or permission. Keep the decision private and make no changes.
