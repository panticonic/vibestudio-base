---
name: agentic-protocol
description: Change the canonical agentic event vocabulary, schemas, reducers, participant identities, hashes, terminal outcomes, tool-failure envelopes, and stored-value encoding.
---

# Agentic protocol

This package is the pure shared contract for agentic events: vocabulary,
validation, canonical encoding, hashing, and deterministic reduction. It has no
RPC transport, persistence, Durable Object lifecycle, model execution, or UI.

Read [agentic development](../../skills/agentic-development/SKILL.md) for the
cross-stack workflow. Runtime consumers include `packages/agentic-do`,
`packages/agentic-core`, `packages/agentic-chat`, `packages/pubsub`, and
`workers/pubsub-channel`.

## Invariants

- Event kinds and payloads form a single discriminated union. Update
  constructors, schemas, exported types, exhaustive reducers, and terminal-kind
  helpers together.
- Encoded events hash canonically. Never put presentation-only or ambient
  runtime data into a hash input, and never accept more than one encoding.
- A terminal outcome must match its terminal event kind. Cancellation,
  abandonment, failure, and completion are distinct recorded outcomes.
- Participant and actor projections must keep public and private identity data
  separate. Renderers do not clean up unsafe metadata after the fact.
- Oversized values are replaced with stored-value references before
  persistence. Inline size limits and hydration validation are deterministic.
- Tool failures use one structured envelope containing the primary failure,
  cleanup evidence, and safe retry policy. Its prose is for display; code must
  not branch on it.
- Reducers are pure and deterministic over retained history. They do not call
  services, read clocks, or infer missing events from current runtime state.

## Changing the contract

1. Decide whether the change affects vocabulary, encoding, or reduction.
2. Add the smallest focused tests in the affected module, including invalid and
   terminal cases.
3. For a change to a persisted shape, reduce representative retained history as
   well as new events.
4. Test and build the channel, agent, and chat consumers that actually import
   the changed code.

There is only one protocol version. Coordinate a breaking change across every
producer and consumer. Do not add optional legacy fields, dual decoders,
version guessing, or consumer-specific normalization.
