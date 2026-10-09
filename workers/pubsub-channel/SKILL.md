---
name: pubsub-channel
description: "Develop the durable workspace conversation service: channel envelopes, participants, replay, delivery, policies, addressing, outbox recovery, and channel lifecycle."
---

# PubSub channel

`workers/pubsub-channel` stores conversation envelopes and manages participant
membership and metadata, replay, delivery settlement, channel configuration,
and recovery. Clients reduce envelopes into the rendered transcript; the agent
runtime executes agent trajectories.

Read [agentic development](../../skills/agentic-development/SKILL.md) for
changes that span the agentic stack, and
[agentic protocol](../../packages/agentic-protocol/SKILL.md) before changing
shared event or participant shapes. Reusable channel clients belong in
`packages/pubsub`; fixed conversation policies belong in
`packages/channel-policies`.

## Invariants

- Persist an accepted envelope before advertising or delivering it. A reconnect
  or alarm may redeliver it but must not record it twice.
- Replay and live delivery present envelopes with the same meaning. Phase
  metadata may describe delivery but must not change what the payload means.
- Stored participant identity, live connection/presence, delivery mode, and
  application configuration are separate. A live socket never establishes
  membership.
- Joins are authorized by the verified caller identity and the locked
  membership policy. Conversation text, claimed metadata, handles, and object
  keys do not authorize anything.
- Participant handles and advertised methods follow the shared validation and
  collision rules. Reject ambiguous names instead of renaming them at delivery
  time.
- Addressed delivery, hop limits, detach boundaries, and policy decisions are
  computed deterministically from the stored causal envelope.
- Outbox retries are idempotent and bounded per attempt. A delivery failure
  must not block unrelated channel work or remove the accepted log entry.
- Archiving, member removal, and other destructive administration keep their
  declared capability and approval requirements.

## Verification

1. Run the focused channel tests the change affects: log append/replay, roster
   transitions, addressed delivery, policy decisions, and outbox recovery.
2. For protocol-shape changes, also run the matching
   `packages/agentic-protocol` reducer/schema tests and check representative
   chat and agent consumers.
3. Build `workers/pubsub-channel` against the current context.
4. Exercise a fresh channel, plus any retained-history case the change can
   affect.
5. Retire the temporary participants and channel resources afterward.
