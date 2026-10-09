---
name: agents
description: Add or remove a worker-backed agent from a chat channel.
---

# Adding an agent to a channel

This skill adds and removes existing agents. To write or change the chat
panel, agent worker/runtime, channel, or protocol, read [agentic
development](../agentic-development/SKILL.md).

An agent is a worker DO in the current workspace. The general chat agent is
`AiChatWorker` in `workers/agent-worker`. `workers/explorer-agent` is a
Personal-only diagnostic worker, not a general-purpose agent. Use the helper to
create an instance and subscribe it to a channel:

```ts
import { addAgentToChannel } from "@workspace-skills/agents";

const result = await addAgentToChannel({
  source: "workers/agent-worker",
  className: "AiChatWorker",
  handle: "assistant",
  name: "Assistant",
  channelId: chat.channelId, // defaults contextId to the current runtime context
  replay: true, // only when eligible existing history should be admitted
  config: {
    /* model, respondPolicy, … per-agent behavior */
  },
});
// → { ok, channelId, contextId, targetId, participantId, key: "assistant-<channelId>" }
```

Remove with `removeAgentFromChannel({ source, className, handle, channelId })`.

The worker, channel, prompt resources, and agent state all come from the
workspace of the target panel. Contexts are branches within that workspace and
never load source from another workspace. Quickfire also uses the target
panel's workspace. Personal and System are private per-user workspaces; native
client code runs from the user's System workspace.

## Per-channel identity

Instances are keyed per channel (`${handle}-${channelId}`), so each channel
gets its own agent DO. Two consequences:

- Do not reuse a scheduled or shared instance key for an ad-hoc channel. One DO
  serving several channels mixes their turn state and corrupts logs.
- Do not replace the helper with `resolveDurableObject` and a guessed key. That
  resolves whatever key you pass instead of creating a channel-local one.

The per-channel key also determines the agent's **directory entry**. Joining a
channel registers the agent in the workspace agent directory as
`<handle>@<channelId>`, which you can address directly:
`notify({ to: "agent:<handle>@<channelId>" })`. One worker in three channels has
three directory entries with the same worker id, because a message to an agent
must say which channel it belongs to. See the `messaging` skill.

Adding the same handle to the same channel again is idempotent. Membership is
persisted; presence and typing are transient UI state. The helper calls
`launchAgentIntoChannel`. Panels that can request workspace review pass their
approval adapter as `waitForReview`; the helper then waits for the review and
retries the launch.

## Multi-agent product topology

Use `respondPolicy: "mentioned-strict"` for agents that should act only when
addressed. Send user text that mentions no one to a single default recipient,
usually a command interpreter, instead of broadcasting it. If the product wants
to allow direct access to experts, a direct mention can bypass the interpreter.

Address messages with the `notify` addressee syntax (`@handle`,
`participant:<id>`, `agent:<handle>@<channelId>`) rather than building your own
mention handling. An addressee that does not resolve fails the call with
suggestions; it never falls back to a broadcast. See the `messaging` skill.

A command interpreter turns natural language into narrow, addressed requests.
Before resolving references such as “the first plan” or “Engineering's
proposal,” it must reread the application state, and it should ask a clarifying
question rather than invent an identifier. Coordinating the conversation does
not mean it needs permission to change state. Methods that change state check
the authenticated caller and leave rules, costs, and invariants to
deterministic code.

If a state change must be followed by a message to another agent, record the
pending message in the same write as the state change and publish it with a
deterministic idempotency key, so a reload can resend it without duplicating it.

## Per-agent setup wrappers

Agents that need credentials, onboarding, or custom config should wrap this
helper. Put the prerequisites in the wrapper and leave channel membership to
this helper.
