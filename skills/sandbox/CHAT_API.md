# Chat API

The `chat` object lets panel-rendered components (`inline_ui`, action bars,
`feedback_custom`) interact with the conversation.

`chat` is also available in agent `eval`, bound to the agent's current channel.
There, your `EvalDO` injects a `chat` proxy that forwards each call to the agent
DO, so messages are published as the agent. Everything below works from agent
eval except `chat.focusMessage`, which is panel-only and resolves `false`
server-side. `chat.participantByHandle` must be awaited in both places, because
server-side the roster is fetched over RPC. CLI and panel eval have no channel
and get no `chat`; use the injected `rpc`/`services` instead. See
[EVAL.md](EVAL.md#chat-agent-eval).

## Access

- **Inline UI and action-bar components**: the `chat` prop, alongside `props`,
  `scope`, and `scopes`
- **Feedback components**: the `chat` prop, alongside `onSubmit`, `onCancel`,
  `onError`, `scope`, and `scopes`

## Interface

```typescript
interface ChatSandboxValue {
  /** Publish an event to the channel */
  publish(
    eventType: string,
    payload: unknown,
    options?: { idempotencyKey?: string },
  ): Promise<unknown>;

  /** Send a visible user-authored message to the channel */
  send(
    content: string,
    options?: { idempotencyKey?: string },
  ): Promise<unknown>;

  /**
   * Scroll the chat to a message and briefly highlight it. Resolves false
   * when the message is not in the rendered transcript (paged-out history,
   * headless sessions). Use after creating a card so the user lands on it -
   * e.g. a digest row's "Reply" focusing the compose card it produced.
   */
  focusMessage(messageId: string): Promise<boolean>;

  /** Publish a custom-message instance for a registered message type */
  publishCustomMessage(
    input: {
      typeId: string;
      initialState?: unknown;
      displayMode?: "inline" | "row";
    },
    options?: { idempotencyKey?: string },
  ): Promise<{ messageId: string; pubsubId: number | undefined }>;

  /** Publish a custom-message update */
  updateCustomMessage(
    messageId: string,
    update: unknown,
    options?: { idempotencyKey?: string },
  ): Promise<number | undefined>;

  /** Register, retire, and look up custom message types (CUSTOM_MESSAGES.md) */
  registerMessageType(
    input: unknown,
    options?: { idempotencyKey?: string },
  ): Promise<number | undefined>;
  clearMessageType(
    typeId: string,
    options?: { idempotencyKey?: string },
  ): Promise<number | undefined>;
  getMessageType(typeId: string): Promise<unknown | null>;
  getMessageTypes(): Promise<unknown[]>;

  /** Look up one durable channel envelope by its stable id; null when absent. */
  replayEnvelope(envelopeId: string): Promise<unknown | null>;

  /** List participants in the current conversation channel. */
  getParticipants(): Promise<
    Array<{
      id: string;
      ref: unknown;
      type: "user" | "panel" | "headless" | "agent";
      name: string;
      isPerson: boolean;
      isAgent: boolean;
      handle?: string;
      methods?: Array<unknown>;
    }>
  >;

  /** Call a method on a channel participant */
  callMethod(
    participantId: string,
    method: string,
    args: unknown,
    options?: { timeoutMs?: number; signal?: AbortSignal },
  ): Promise<unknown>;

  /** Call a method and return the full transport result envelope */
  callMethodResult(
    participantId: string,
    method: string,
    args: unknown,
    options?: { timeoutMs?: number; signal?: AbortSignal },
  ): Promise<{
    content: unknown;
    attachments?: unknown[];
    contentType?: string;
  }>;

  /** Resolve a participant by handle, accepting "gmail" or "@gmail" (async:
   *  the same surface works server-side, where the roster is fetched over RPC) */
  participantByHandle(
    handle: string,
  ): Promise<{ id: string; metadata: Record<string, unknown> } | null>;

  /** Call by participant handle and return the provider payload */
  callMethodByHandle(
    handle: string,
    method: string,
    args: unknown,
    options?: { timeoutMs?: number; signal?: AbortSignal },
  ): Promise<unknown>;

  /** Call by participant handle and return the full invocation envelope */
  callMethodResultByHandle(
    handle: string,
    method: string,
    args: unknown,
    options?: { timeoutMs?: number; signal?: AbortSignal },
  ): Promise<{
    content: unknown;
    attachments?: unknown[];
    contentType?: string;
  }>;

  /** Current context ID */
  contextId: string;

  /** Current channel ID */
  channelId: string | null;

  /** RPC bridge — call any server/main service */
  rpc: {
    call: (target: string, method: string, args: unknown[]) => Promise<unknown>;
  };
}
```

## chat.getParticipants

Read the live participant roster of the current conversation:

```typescript
const participants = await chat.getParticipants();
return participants.map(
  ({ id, ref, type, name, isPerson, isAgent, handle }) => ({
    id,
    ref,
    type,
    name,
    isPerson,
    isAgent,
    handle,
  }),
);
```

The roster covers this channel only and can include people, agents, and
headless participants. Identity and classification fields are top-level.
`type: "user"` is a person and `type: "agent"` is an agent; `panel` and
`headless` are client transports, not agents. Read `isPerson`/`isAgent` instead
of inferring a role from the participant id or reference.

The roster is not workspace-wide presence. For who is online in the workspace,
use `services.workspacePresence.list()`; for membership and roles, use
`services.account.listWorkspaceMembers()`. To diagnose a channel's recorded
roster history, `gad.inspectChannelRoster(...)` may help.

## chat.send

Send a user-authored prompt back to the conversation.

```typescript
await chat.send("Hello from sandbox!");
```

`chat.send(content, options?)` wraps the text in a `message.completed` agentic
event and publishes it. The message appears in the conversation as user intent
and can start an agent turn. The channel client generates the ids. Use it when a
UI action is a user choice or follow-up instruction for the agent, such as
"refresh", "deploy", or "continue".

Do not use `chat.send` for agent acknowledgements or eval status. Those belong
in the agent's own response, or in a typed non-message event or UI surface when
they are not a user prompt.

## chat.publish

Publish typed non-message events to the PubSub channel. Every message visible
in the transcript is written to the typed agentic event log and rendered from
the PubSub channel history. GAD may store that history, but components still
work in PubSub terms: producers publish channel events, the UI reduces them, and
GAD records provenance links for audit and queries.

Do not hand-publish transcript UI as raw `"message"` records; they are stored
but not reduced into the transcript. Use the `inline_ui`, `load_action_bar`,
`feedback_form`, and `feedback_custom` tools, which record the right UI and
invocation events. Custom message types (a registered React renderer backing
many updatable instances) are also published through `chat.publish`, with the
`agentic.trajectory.v1/event` payload kind; see
[CUSTOM_MESSAGES.md](CUSTOM_MESSAGES.md).

For provenance, use `gad.getTrajectoryForEnvelope()` or
`gad.listPublishedEnvelopesForTrajectory()`. Do not read private trajectory
state as if it were the chat transcript.

`await chat.replayEnvelope(envelopeId)` looks up one envelope on the current
channel, following channel lineage, and returns `null` when the id belongs to
another log (for example, a VCS commit event). It works in panel components and
in agent-owned server eval.

## chat.callMethod

Call a registered method on a channel participant. The promise resolves to the
provider's return value once the method returns.

```typescript
// Call a method on an agent
const result = await chat.callMethod("agent-participant-id", "someMethod", {
  arg1: "value",
});
```

Inline UI components use this to trigger agent-side behavior directly. The
target must be a participant in the current `chat.channelId`. To inspect an
agent that may itself be stuck, in this or any channel, use the read-only
`gad.inspectAgent({ channelId, method })` and the GAD inspectors instead; see
`../gad-context/DIAGNOSTICS.md`.

## chat.callMethodByHandle

Resolve a channel participant by its advertised handle and call a method. Both
`"gmail"` and `"@gmail"` work.

```typescript
const result = await chat.callMethodByHandle("gmail", "checkNow", {});
```

`chat.callMethodByHandle()` resolves to the provider payload. Use
`chat.callMethodResultByHandle()` only when you need the full invocation result
envelope.

## chat.callMethodResult

Call a registered method and receive the full invocation result envelope. Use
it only when you need metadata such as `attachments` or `contentType`; otherwise
use `chat.callMethod()`.

```typescript
const result = await chat.callMethodResult(
  "agent-participant-id",
  "someMethod",
  {},
);
console.log(result.content, result.contentType, result.attachments);
```

## chat.publishCustomMessage / chat.updateCustomMessage

Publish or update an instance of a registered custom message type. These
helpers emit the `custom.started` / `custom.updated` events; `publishCustomMessage`
returns the generated `messageId` for later updates.

```typescript
const { messageId } = await chat.publishCustomMessage({
  typeId: "gmail.compose",
  initialState: { to: "a@example.com", subject: "Hello" },
  displayMode: "row",
});

await chat.updateCustomMessage(messageId, { status: "sent" });
```

## chat.rpc

RPC bridge to all server and main-process services. It is the same typed public
caller as `rpc` from `@workspace/runtime`, available without importing the
runtime. Main-process calls use descriptors from
`@vibestudio/service-schemas/mainRpc`.

```typescript
import { mainRpcMethods } from "@vibestudio/service-schemas/mainRpc";
import { todoStoreRpcMethods } from "@workspace-workers/todo-store/contract";

// Filesystem
const content = await chat.rpc.call("main", mainRpcMethods["fs.readFile"], [
  "src/index.ts",
  "utf-8",
]);

// DO-backed app database
// Resolve a manifest-declared Durable Object service, then call its narrow methods.
const store = await chat.rpc.call("main", mainRpcMethods["workers.resolveService"], [
  "example.todos.v1",
  "project-123",
]);
if (store.kind !== "durable-object") throw new Error("Expected DO service");
const rows = await chat.rpc.call(store.targetId, todoStoreRpcMethods.listTodos, []);

// Build
const build = await chat.rpc.call("main", mainRpcMethods["build.getBuild"], ["panels/my-app"]);

// Browser data (panel/component runtime; resolves the manifest-declared broker)
import { browserData } from "@workspace/runtime";
const importHosts = await browserData.listImportHosts();

// Workers (running worker instances)
const instances = await chat.rpc.call("main", mainRpcMethods["runtime.listEntities"], [
  { kind: "worker" },
]);
```

## chat.contextId / chat.channelId

Read-only identifiers for the current panel context and PubSub channel.

```typescript
console.log("Context:", chat.contextId); // e.g., "ctx-tree-new-abc123"
console.log("Channel:", chat.channelId); // e.g., "chat-504fef6a"
```

## Sender Identity

From a panel component, `chat.send(...)` messages come from the **panel** (the
user side), not the agent, because the panel's PubSub client sends them. Use it
when an inline UI, action bar, or other user-triggered control sends a visible
follow-up prompt for the user:

```typescript
await chat.send("Deploy the staging build");
```

Do **not** use `chat.publish("message", { content })` for visible messages. It
writes a legacy raw PubSub row (`type: "message"`) that is stored in the channel
log but not rendered by the `agentic-chat` transcript UI. `chat.publish(...)` is
for typed events such as `agentic.trajectory.v1/event` or custom message
events, not chat text.
