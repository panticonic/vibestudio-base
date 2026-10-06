---
name: chat-panel
description: Develop the workspace chat panel's product composition, model preflight, channel creation, installed-agent lifecycle, state arguments, and exact-context UI verification.
---

# Chat panel

`panels/chat` is the product composition root for an agentic conversation. It
selects the channel, model setup, installed agents, feature set, and reusable
`@workspace/agentic-chat` surface. It does not own generic transcript rendering,
the agent loop, channel persistence, or the event vocabulary.

For a coordinated stack change, read [agentic development](../../skills/agentic-development/SKILL.md).
For reusable presentation behavior, read
[agentic chat](../../packages/agentic-chat/SKILL.md). For panel lifecycle and
visual diagnosis, read [workspace development](../../skills/workspace-dev/SKILL.md).

## Invariants

- The host-bound panel `contextId` is authoritative. State args may describe a
  channel or presentation, but never select or contradict the workspace branch.
- Channel creation, durable slot placement, agent creation, subscription, and
  model readiness are distinct states. Preserve their typed failures instead of
  collapsing them into a loading boolean or retry loop.
- Persist each installed agent's minted object key and per-agent configuration.
  Rehydration reuses that identity; it does not spawn a replacement participant.
- Launch and unsubscribe through `@workspace/agentic-core` lifecycle helpers.
  Do not resolve a guessed DO key or add a second subscription path in the panel.
- Browser-owned chat capabilities are fixed for the participant lifetime. A
  changed advertised method surface requires a new join.
- Keep model selection and credential setup in the model-settings workflow.
  The chat panel must not infer readiness from the presence of a secret.

Put reusable component, transcript, composer, renderer, and theming changes in
`packages/agentic-chat`. Put generic agent launch state machines in
`packages/agentic-core`. Put agent execution behavior in `packages/agentic-do`
or `workers/agent-worker`.

## Verification

Run focused tests beside `bootstrap.ts`, `agentLifecycle.ts`, and the affected
chat behavior, then build `panels/chat` against the exact semantic context.
Open or rebuild one panel with an explicit matching context and
the ref `ctx:${ctx.contextId}`. Reuse its handle; inspect lifecycle observation,
structured snapshot, screenshot, accessibility, and console errors. Exercise
channel creation or rehydration when the change touches either path, and remove
temporary agents and panels when finished.

Saving managed source advances the semantic working state; it does not reload
an open chat page. `handle.reload()` restarts the currently selected immutable
build and is appropriate for renderer-state recovery. `handle.rebuild()`
resolves and prepares the panel's active ref again, then atomically replaces the
runtime attempt and waits for the boot handshake. Use `rebuild()` after changes
to `panels/chat` or any transitive package such as `packages/agentic-chat`.
Rebuilding a panel whose active ref is `main` does not adopt unpublished context
work; navigate or open it at the explicit context ref first. Publication may
prepare a new main artifact, but it does not forcibly reload an open page.

The panel slot id and handle survive a rebuild. Its `attemptId`, runtime entity,
build key, and CDP page may not. Refresh a retained CDP session after rebuild;
never keep using its old page. Rebuilding the chat panel reconnects the UI to
the durable channel but does not replace the separately running agent worker.

## Conversation creation and seeding

Use `stateArgs.seed` when opening a new `panels/chat` conversation:

```ts
await openPanel("panels/chat", {
  stateArgs: {
    seed: {
      messages: [
        {
          author: "Product introduction",
          content:
            'Welcome.\n\n<Video url="https://youtu.be/Pb6C4ORBOOI" title="Introduction" />',
        },
      ],
      openingRequest: "Help me get started.",
    },
  },
});
```

Creation retains the definition before exposing the conversation. Authored
messages are durable assistant-style messages attributed to a system author,
not a fabricated agent identity. The opening request waits durably for a
subscribed agent and can be explicitly cancelled. Model/provider setup and
seeded history coexist in the scrolling transcript. Readiness never depends on
transcript emptiness. Connecting credentials does not override an explicit
first-run model choice or its Start control.

The channel's read-only `initialization` projects whether a first agent has ever
joined and the unresolved opening request. Reopen the same `channelName` to read
its state; supplied creation seeds do not modify existing conversations.
Reload, reconnect, remount, and creation retries never reinstall the seed.
Forks inherit their selected history and retire the source creation operation;
they do not seed again. Use an ordinary deliberate message for a new request in
an existing conversation, or create a new conversation with a new seed.

The reusable chat component accepts `channelConfig.seed` as creation input;
PubSub installs it on the first context-bound subscription, before replay.
`client.resolveOpeningRequest("deliver")` requires a subscribed agent;
`"cancel"` explicitly retires the request. The chosen resolution is retained
across retries. Neither `seed` nor `initialization` is mutable channel config.
The former `initialPrompt`, force flag, and auto-send-on-mount API are removed.

If a resident agent launches before its panel connects, declare creation first:

```ts
import { initializeConversation } from "@workspace/pubsub";
await initializeConversation({ rpc, channel: channelName, contextId,
  config: { seed: { openingRequest: "Help organize this collection" } } });
// Now launch the resident agent into the same channel and context.
```

This uses the same channel-owned initialization operation as panel subscription.
It does not require model credentials or an agent. Opening-request delivery is
attributed to the authenticated participant who releases it; a retry preserves
that accepted author. Delivery failures remain visible and support explicit
retry without silently spinning or discarding the retained request.

A failed resolution stays pending until its durable notification is accepted.
An already delivered request can finish that operation after its receiving agent
leaves; retries preserve its original author and do not send it again. New user
input stays behind queued deliveries when a delivery fails, until retry or
explicit cancellation resolves the older items.

Removal is available before publication begins. Once an item is being sent, its
remove control is disabled until the owned publication completes or fails; a
failed item's removal releases later queued input without retrying that item.

If the final resolution append succeeds but its reply is lost, channel replay or
reopening recovers the completed operation from its canonical envelope. It does
not require another send or the original agent to remain attached.

A turn opens once. Background suspension publishes `turn.waiting`; resuming the same retained turn publishes `turn.resumed`, preserving its original identity and opening time while clearing its waiting reason. Repeated `turn.opened` events are rejected by the canonical log and must never be used to resume work.

If a child input settles unanswered and its execution has stopped, the supervisor publishes the original failure through the retained subagent terminal path. It must not merely mark the child idle: a supervisor suspended for background work needs an actionable failure report. This uses the settled native input as authority, preserves prior domain terminals, and retains the same publication identity across explicit retry.
