---
name: chat-panel
description: Develop the workspace chat panel's product composition, model preflight, channel creation, installed-agent lifecycle, state arguments, and exact-context UI verification.
---

# Chat panel

`panels/chat` assembles an agentic conversation: it picks the channel, model
setup, installed agents, feature set, and the reusable `@workspace/agentic-chat`
UI. Generic transcript rendering, the agent loop, channel persistence, and the
event vocabulary live elsewhere.

Related skills:

- [Agentic development](../../skills/agentic-development/SKILL.md) for changes
  that span the agentic stack.
- [Agentic chat](../../packages/agentic-chat/SKILL.md) for reusable
  presentation.
- [Workspace development](../../skills/workspace-dev/SKILL.md) for panel
  lifecycle and visual diagnosis.

## Invariants

- The host-bound panel `contextId` decides the workspace branch. State args may
  describe a channel or presentation but never select or contradict the branch.
- Channel creation, slot placement, agent creation, subscription, and model
  readiness are separate states. Keep their typed failures; do not collapse
  them into a loading boolean or a retry loop.
- Persist each installed agent's minted object key and per-agent configuration.
  Rehydration reuses that identity instead of spawning a replacement
  participant.
- Launch and unsubscribe agents through the `@workspace/agentic-core` lifecycle
  helpers. Do not guess a DO key or add a second subscription path in the panel.
- Browser-provided chat capabilities are fixed for the participant's lifetime.
  Changing the advertised methods requires a new join.
- Model selection and credential setup belong to the model-settings workflow.
  The chat panel must not treat the presence of a secret as readiness.

Where other changes go:

- Reusable components, transcript, composer, renderers, theming:
  `packages/agentic-chat`.
- Generic agent launch state machines: `packages/agentic-core`.
- Agent execution behavior: `packages/agentic-do` or `workers/agent-worker`.

## Verification

1. Run the focused tests beside `bootstrap.ts`, `agentLifecycle.ts`, and the
   affected chat behavior.
2. Build `panels/chat` against the semantic context you are working in.
3. Open or rebuild one panel with that context and the ref
   `ctx:${ctx.contextId}`. Reuse its handle to inspect lifecycle observation,
   the structured snapshot, a screenshot, accessibility, and console errors.
4. If the change touches channel creation or rehydration, exercise that path.
5. Remove temporary agents and panels when finished.

Saving managed source advances the semantic working state but does not reload an
open chat page.

- `handle.reload()` restarts the currently selected immutable build. Use it to
  recover renderer state.
- `handle.rebuild()` resolves and prepares the panel's active ref again,
  atomically replaces the runtime attempt, and waits for the boot handshake. Use
  it after changing `panels/chat` or any package it depends on, such as
  `packages/agentic-chat`.

Rebuilding a panel whose active ref is `main` does not pick up unpublished
context work; first navigate or open it at the context ref. Publishing may
prepare a new main artifact, but it does not reload an open page.

A rebuild keeps the panel slot id and handle. The `attemptId`, runtime entity,
build key, and CDP target may change; the stable session page rebinds on its
next awaited operation and records the new generation in `session.receipt`.
Rebuilding the chat panel reconnects the UI to
the stored channel; it does not replace the separately running agent worker.

## Conversation creation and seeding

Pass `stateArgs.seed` when opening a new `panels/chat` conversation:

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

The seed is stored before the conversation becomes visible.

- Seeded `messages` are persisted assistant-style messages attributed to a
  system author, not to an invented agent identity.
- The `openingRequest` waits, persisted, until an agent subscribes. It can be
  cancelled explicitly.
- Model/provider setup and seeded history appear together in the scrolling
  transcript. Readiness never depends on the transcript being empty.
- Connecting credentials does not override an explicit first-run model choice
  or its Start control.

The seed applies only at creation:

- The channel's read-only `initialization` reports whether a first agent has
  ever joined and any unresolved opening request. Reopen the same
  `channelName` to read it.
- A seed passed for an existing conversation does not change it. Reload,
  reconnect, remount, and creation retries never reinstall the seed.
- Forks inherit their selected history and retire the source's creation
  operation; they are not seeded again.
- To make a new request, send a normal message in the existing conversation or
  create a new conversation with a new seed.

The reusable chat component accepts `channelConfig.seed` as creation input.
PubSub installs it on the first context-bound subscription, before replay.
`client.resolveOpeningRequest("deliver")` requires a subscribed agent;
`"cancel"` retires the request. The chosen resolution is kept across retries.
Neither `seed` nor `initialization` is mutable channel config. The old
`initialPrompt`, force flag, and auto-send-on-mount API have been removed.

If a resident agent launches before its panel connects, initialize the
conversation first:

```ts
import { initializeConversation } from "@workspace/pubsub";
await initializeConversation({
  rpc,
  channel: channelName,
  contextId,
  config: { seed: { openingRequest: "Help organize this collection" } },
});
// Now launch the resident agent into the same channel and context.
```

This runs the same channel initialization as a panel subscription and needs
neither model credentials nor an agent.

### Opening-request delivery

- Delivery is attributed to the authenticated participant who releases the
  request. A retry keeps that author.
- Delivery failures stay visible and can be retried explicitly. The retained
  request is never silently retried or discarded.
- A failed resolution stays pending until its notification is accepted.
- An already delivered request can finish its operation after the receiving
  agent leaves. Retries keep the original author and do not send it again.
- When a delivery fails, new user input queues behind it until a retry or an
  explicit cancellation resolves the older items.
- A queued item can be removed until sending starts. While it is being sent,
  its remove control is disabled until the send completes or fails. Removing a
  failed item releases the input queued after it without retrying the failed
  item.
- If the final resolution append succeeds but its reply is lost, channel replay
  or reopening recovers the completed operation from its stored envelope. No
  second send is needed, and the original agent does not have to stay attached.

### Turn and subagent events

A turn opens once. Background suspension publishes `turn.waiting`; resuming the
same turn publishes `turn.resumed`, which keeps its identity and opening time
and clears the waiting reason. The event log rejects a repeated `turn.opened`;
never use it to resume work.

If a child agent's input settles unanswered after its execution has stopped,
the supervisor publishes the original failure through the subagent terminal
path. Marking the child idle is not enough: a supervisor suspended on
background work needs an actionable failure report. The settled input
determines this outcome, earlier domain terminal events are preserved, and an
explicit retry reuses the same publication identity.
