---
description: Reconcile the effect acknowledgment with authoritative final membership.
args:
  request: ChannelAgentRequest
  decision: MembershipDecision
  observed: RosterObservation
  receipt: MembershipReceipt | null
returns: ChannelAgentReport
---
Return observed.state and observed.participantId exactly. Choose status by the following rules in order.

1. A hold decision gives held. Otherwise an inspect request gives observed and a confirm decision gives unchanged.
2. With a change attempted, unavailable evidence, conflicting identity, or a mismatch between a receipt's participantId and the actual member yields uncertain.
3. If the receipt reports already and the requested membership is observed, return unchanged.
4. If the receipt reports acknowledged or uncertain and the exact requested membership is now observed, return applied. Attachment requires an actual member and its participant ID. Detachment requires authoritative absence.
5. An uncertain or acknowledged effect whose requested final membership is missing gives uncertain. Other outcomes give held.
