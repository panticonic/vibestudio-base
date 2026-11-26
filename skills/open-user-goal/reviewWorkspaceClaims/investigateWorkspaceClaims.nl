---
description: Produce actual scoped workspace-claims evidence for the outer coordinator.
args:
  goal: string
returns: ClaimInquiry
uses: [reviewWorkspaceClaims/workspace/listClaimScopes, reviewWorkspaceClaims/selectClaimPacket, reviewWorkspaceClaims/workspace/readClaimPacket, reviewWorkspaceClaims/workspace/readClaimEvidence, reviewWorkspaceClaims/verifyClaimSupport]
---
Choose the actual requested current claim packet and obtain its native evidence. Preserve packet/source identity and candidate-versus-prior relationships; an archive or similarly named scope is not the same packet. Use the installed evidence-rule hierarchy to determine support from actual observations, not from the whole imperative goal or an announced intention.

Return the actual selection, packet, evidence and support. Keep unavailable values null and unsupported requirements missing. This inquiry does not write a note or substitute a generic completion report for the requested answer.
