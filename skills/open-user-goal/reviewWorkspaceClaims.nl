---
description: Decide which specific workspace claims their exact revisions and actual TestKit or authority observations support.
budget: { maxTurns: 28 }
args:
  goal: string
returns: WorkspaceClaimReview | null
---
1. Call workspace.listClaimScopes and selectClaimPacket with that index and the goal. Read the selected packet through workspace.readClaimPacket. Then read workspace.readClaimEvidence for that same id. Stop with null when either is unavailable or scoped to a different packet.
2. Call verifyClaimSupport with the exact packet and evidence. Call summarizeClaimReview with the original goal, packet, evidence and support.
3. Return choice, packet, evidence, support, disposition and handoff null. For an explicit private note, call workspace.writeClaimNote with the complete report and set handoff to the actual receipt.
