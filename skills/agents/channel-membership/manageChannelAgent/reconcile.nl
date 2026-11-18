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
2. A blocked or rejected receipt gives held. No successful effect was acknowledged.
3. With a change attempted, unavailable evidence, conflicting identity, or a mismatch between a receipt's participantId and the actual member yields uncertain.
4. The desired outcome for attachment requires an actual member and its participant ID. For detachment it requires authoritative absence. If the requested outcome is missing, return uncertain.
5. With the desired outcome observed, return unchanged for already, applied for acknowledged, and reconciled for uncertain. Reconciled confirms the final membership but leaves the source of the change unresolved.
