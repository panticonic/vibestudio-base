---
name: agentic-development
description: Modify and verify Vibestudio's workspace-owned agentic stack across the chat panel, agent worker/runtime, channel service, and agentic protocol. Use for coordinated agent behavior or conversation-stack changes; not for merely adding an existing agent to a channel.
---

# Agentic stack development

The agentic stack is managed workspace source like any other unit. Change it
with semantic authoring, verify it in its context, and publish through protected
`main`.

## Ownership map

Read the skill of every unit your change touches:

| Concern                                                       | Owner                       | Read                                                         |
| ------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------ |
| Chat product composition, model setup, agent lifecycle        | `panels/chat`               | [Chat panel](../../panels/chat/SKILL.md)                     |
| Reusable React conversation UI                                | `packages/agentic-chat`     | [Agentic chat](../../packages/agentic-chat/SKILL.md)         |
| Default chat-agent product adapter and tool selection         | `workers/agent-worker`      | [Chat agent worker](../../workers/agent-worker/SKILL.md)     |
| Native Sessions, protected operations, diagnostics, subagents | `packages/agentic-do`       | [Agentic DO](../../packages/agentic-do/SKILL.md)             |
| Event vocabulary, schemas, reducers, hashes, stored values    | `packages/agentic-protocol` | [Agentic protocol](../../packages/agentic-protocol/SKILL.md) |
| Durable channel log, roster, replay, delivery, policies       | `workers/pubsub-channel`    | [PubSub channel](../../workers/pubsub-channel/SKILL.md)      |

Client-side coordination goes in `packages/agentic-core`; reusable channel
clients go in `packages/pubsub`. The native scheduler and provider library come
from the immutable `@panticonic/pi-*` fork; `packages/agentic-do` binds them to
protected product ports, and `packages/model-catalog` provides provider
metadata. Fix logic where it lives rather than reinterpreting it in a consumer.

The main flow is:

```text
panels/chat + packages/agentic-chat
                 ⇅
        workers/pubsub-channel
                 ⇅
 workers/agent-worker + packages/agentic-do
                 ⇅
      native Session tasks / channel receipts
```

`packages/agentic-protocol` defines the shared types and reducers used across
these layers. It has no transport, storage, runtime, or rendering.

## Development loop

Read [workspace development](../workspace-dev/SKILL.md) and [semantic
VCS](../vibestudio-vcs/SKILL.md) before authoring.

1. Check the current semantic working state and read the smallest set of
   units involved. Use live docs for callable APIs and the source for
   implementation details.
2. Make the change in the package that owns the logic (see the table). When a
   shared discriminant or contract changes, update every consumer that handles
   it exhaustively in the same application. Do not add a compatibility flag, a
   parallel event path, or consumer-specific reinterpretation.
3. Run the package tests that cover the change. Then build every affected
   runnable unit in the context, usually `panels/chat`, `workers/agent-worker`,
   and/or `workers/pubsub-channel`.
4. Test with a fresh canary on the same semantic state. Panel code needs an
   explicit `contextId` and a ref such as `ctx:${ctx.contextId}`; workers and
   DOs resolve in the panel's context. Check the canary's transcript,
   invocation failures, channel delivery, lifecycle, and console output as the
   change requires.
5. Remove every temporary panel, channel participant, worker/DO, page, and
   diagnostic handle the canary created. Commit the complete local chain only
   after the focused checks pass. Publish only if the task includes advancing
   protected `main`.

## Self-replacement contract

Changing the code, prompt assembly, skills, tools, or protocol of the agent
that is currently running does not change that running agent. Its runtime
build, loaded prompt resources, channel membership, and advertised methods stay
as they are until it is recreated.

Keep the current agent as the parent and test the change in a canary:

- build the changed source in its semantic context;
- create a fresh channel or a uniquely named canary agent in that context;
- give the canary a small, realistic task;
- inspect its persisted result and any failures from the parent; then
- unsubscribe and remove the canary.

Add and remove agents with the [agents](../agents/SKILL.md) skill. If a change
affects chat boot, channel creation, and protocol negotiation together, open a
temporary `panels/chat` at the context ref so all three run the new code
together. Do not reload the parent agent or reuse an existing channel just to
get the new code running.

Editing panel source does not update an open page. `handle.reload()` restarts
the renderer on the build it already has. `handle.rebuild()` builds a new
immutable attempt at the panel's active ref and switches to it atomically. Use
`rebuild()` after changing the panel's source or any package it depends on. The
panel slot id stays the same, but the attempt, runtime entity, build key, and
CDP generation may change.

## Protocol blast radius

Channel envelopes and trajectory events are persisted. Changing an event
kind, terminal outcome, participant identity, stored-value encoding, hash input,
or replay reduction usually affects producers, schemas, reducers, persistence,
renderers, and diagnostics at once. Test both handling of new events and
reduction of representative existing history; a canary on a fresh, empty
channel does not cover a change to the persisted shape.

Keep a single version of the contract. If a breaking change is needed, update
every affected package and its tests together. Do not leave behind dual readers
or writers, version guessing, or an optional legacy mode.
