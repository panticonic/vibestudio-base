---
description: Judge each acceptance statement using the installed workspace-evidence guidance and concrete observations.
args:
  packet: ClaimPacket
  evidence: ClaimEvidence
returns: ClaimSupport
---
Extract required as the original requirement texts in packet order. Pass that array and all evidence.observations unchanged to evidenceRules.checkSupport. Its internal workspace-evidence skill distinguishes a source revision, an executed test, a visible control, and an authority preflight, within their own exact states. Return the installed checker's two exact lists.
