# `@workspace/agentic-core/chat-store` — the headless chat core

Everything a chat client does that is not drawing pixels lives here, with no
React and no browser APIs. The chat panel, `HeadlessSession` (system tests) and
a terminal chat are all clients of these stores; there is exactly one
implementation of connection handling, transcript reduction, the outbox, the
first-agent flow, fork lineage and the host's agent management.

```
ChatHostController              host side: channel bootstrap, model settings,
  (StateArgsPort, rpc, …)        agent catalog, installed agents + recovery,
        │ actions + data          provisional first agent, fork read cursors
        ▼
ChatSession                      one participant on one channel
  ├─ ConnectionManager           join (stream | resident delivery), owned retry loop
  ├─ ChannelViewFeed             durable events · message.delta · replay · paging
  ├─ composer + outbox           draft, send, publish, edit, retract/undo, flush
  ├─ ChatMethodRegistry          channel methods this participant advertises
  ├─ deferredAgent               DeferredAgentMachine: first-agent setup + pre-send queue
  └─ forks                       ForkLineageStore (when fork navigation is supplied)
ChildTranscriptStore            observe a subagent's task channel (one per card)
ChannelSignalsStore             transient "working…" style signals
```

Import everything from `@workspace/agentic-core/chat-store`. React bindings
(`useChatStore`, `useStoreSnapshot`, `useRetainedStore`,
`useChatMethodProvider`, `useChatSession`) live in `@workspace/agentic-chat`;
nothing in this directory needs them.

## The store contract

Every store implements `ReadableStore<Snapshot>`:

```ts
interface ReadableStore<Snapshot> {
  getSnapshot(): Snapshot;                     // immutable; same object until something changed
  subscribe(listener: () => void): () => void; // called once per input, after it settled
}
```

- **One pipeline per input.** An event, a host update or a user action runs
  *reduce → derive → react* inside one transaction, and subscribers are
  notified once with a coherent snapshot. There are no intermediate frames.
- **Stable identity.** A snapshot keeps its identity until a field changes, and
  fields keep theirs when unchanged: transcript rows that did not change are the
  very same `ChatMessage` objects after a rebuild (`sameChatMessage`). Compare by
  identity to skip re-rendering (an Ink `memo` row, for example).
- **Lifetime is reference counted.** `retain()` returns a release function. The
  first holder starts live work; after the last release the store disposes at
  the end of the current turn (a microtask), so a holder that re-retains in the
  same turn (React StrictMode's remount) keeps the same instance. `dispose()`
  ends it immediately. Construction never has side effects.
- **No timers you have to manage.** Async work is owned by `AbortController`
  generations and is cancelled by disposal, reconnects and supersession. The
  only timers are product behaviour (listed under *Timing*).
- **Errors are data.** Failures that the user should see land in a snapshot
  field (`connectionError`, `queued[i].failure`, `launchError`,
  `modelSettingsError`, `recovery.error`, …) shaped as a `UserFacingError`:
  `{ title, message, detail?, cause? }` — what happened, the next step, and the
  technical text for a Details disclosure. Never show `cause` or a stack.
  Nothing throws into your render loop, and a failure shown in a snapshot is
  never also pushed through a notification port.

## Quick start: a terminal chat in a Durable Object

```ts
import {
  ChatHostController,
  ChatSession,
  chatHostActionData,
  type StateArgsPort,
} from "@workspace/agentic-core/chat-store";

// 1. Host state in the DO's storage.
const state: StateArgsPort = createStoragePort(this.ctx.storage); // see "StateArgsPort"

// 2. The host side: decides the channel, discovers models and agents.
const host = new ChatHostController({
  rpc: { call: rpc.call },          // host "main" + workspace DOs
  contextId,                        // the workspace context agents are created in
  state,
  instanceId: sessionId,            // unique per terminal session
  notify: (n) => this.toast(n),     // optional: failures the user must see
});
const releaseHost = host.retain();

// 3. Once the host knows the channel, open the session on it.
const channelName = await new Promise<string>((resolve) => {
  const check = () => {
    const name = host.getSnapshot().channelName;
    if (name) { off(); resolve(name); }
  };
  const off = host.subscribe(check);
  check();
});
const session = new ChatSession({
  config: { clientId: sessionId, rpc, deliveryMode: "resident" },
  channelName,
  contextId,
  metadata: { name: "Terminal", type: "panel" },
  agentHost: { ...host.actions, ...chatHostActionData(host.getSnapshot()) },
  ports: { presentTitle: (title) => this.setTabTitle(title) },
});
session.registerMethods("feedback", () => ({ feedback_form: terminalFeedbackForm }));
const releaseSession = session.retain();
session.start();

// 4. Keep the session's host inputs current.
let retrySignal = host.getSnapshot().connectionRetrySignal;
host.subscribe(() => {
  const snapshot = host.getSnapshot();
  session.setAgentHost({ ...host.actions, ...chatHostActionData(snapshot) });
  if (snapshot.connectionRetrySignal !== retrySignal) {
    retrySignal = snapshot.connectionRetrySignal;
    session.reconnect("host-unblocked");
  }
});

// 5. Render from snapshots.
session.subscribe(render);
session.deferredAgent.subscribe(render);
function render() {
  const s = session.getSnapshot();
  const { deferredAgent } = session.deferredAgent.getSnapshot();
  draw(s.messages, s.input, s.agentBusy, s.connectionError, deferredAgent);
}

// 6. Input.
onKey((text) => session.setInput(text));
onEnter(() => void session.submit());           // holds the first message while the first agent starts
onEscape(() => void session.flushOutboxAndInterrupt());

// 7. Shutdown.
releaseSession();
releaseHost();
```

A browser panel does the same through `AgenticChat` (which builds its session
from `config`/`channelName`/`actions` props); see `base/panels/chat/index.tsx`.

## `ChatSession`

```ts
new ChatSession(options: ChatSessionOptions)
```

| Option          | Meaning |
| --------------- | ------- |
| `config`        | `ConnectionConfig`: `clientId` (stable participant id), `rpc` (`call`, `stream`, `on`, `selfId`; resident delivery also needs `registerResidentSession`), `deliveryMode` (`"stream"` default, or `"resident"` inside a Durable Object), `replayMessageLimit`, `recoveryCoordinator`, `protocol`. |
| `channelName`   | The channel. Required by `start()`; `connect()` may name it instead. |
| `channelConfig` | Creation config passed on join (seed, initial title). `setChannelConfig()` replaces it. |
| `contextId`     | Workspace context the channel must resolve in. |
| `metadata`      | Participant label (`{ name, type }`). Humans get their identity from the channel, not from this. |
| `ports`         | `presentTitle(title, { explicit })` (called only when the title text or its explicitness changes), `observeEvent(event)`; both optional. |
| `agentHost`     | Agent management (`onAddAgent`, `onPrepareAgent`, `onReplaceAgent`, `onPersistAgentModel`, `onRemoveAgent`, `onParticipantsChanged` — called with the present participant ids on every roster change) and catalog data (`availableAgents`, `modelCatalog`, `defaultModelRef`, `defaultAgentConfig`, `firstAgentModelPreflight`). Replace with `setAgentHost()`. Omit to disable the first-agent flow. |
| `forkNav`       | `ForkNavHandlers`. Present at construction ⇒ `session.forks` exists. Replace handlers with `setForkNav()`. |

### Snapshot (`ChatSessionSnapshot`)

| Field | Type | Meaning |
| ----- | ---- | ------- |
| `channelName` | `string \| null` | The joined or configured channel. |
| `status` | `string` | Human-readable connection status. |
| `connected` | `boolean` | A join is live. |
| `connectionError` | `{ title, message, detail?, retryable, at, cause? } \| null` | A failure the user should see (join, interrupt, cancel, read-back): `title` says what happened, `message` the next step, `detail` the technical text for a Details disclosure. Offer `reconnect("user-retry")` only when `retryable`. |
| `client` | `PubSubClient \| null` | The live channel client. |
| `selfId` | `string \| null` | This participant's channel id. |
| `initialization` | `{ firstAgentPending, openingRequest? } \| undefined` | Channel creation state. |
| `channelTitle` | `string \| null` | Current title. |
| `participants` / `allParticipants` | `Record<id, Participant>` | Present roster / everyone seen (for attributing old messages). |
| `messages` | `ChatMessage[]` | The visible transcript (≤ 2000) plus local "agent disconnected" rows. |
| `view` | `ChannelViewState` | The reduced channel view the messages were derived from (turns, invocations, approvals, credential requests, forks…). |
| `hasMoreHistory` / `loadingMore` | `boolean` | History paging state. |
| `historyError` | `string \| null` | Last history-page or transcript-stream failure (cleared when paging is retried). |
| `replaySettled` | `boolean` | Initial replay finished; `messages` reflects prior history. |
| `actionBar`, `messageTypes` | | Canonical action bar and custom message type definitions. |
| `hasOpenTurn` | `boolean` | An agent turn is open or waiting. |
| `agentBusy` | `boolean` | Typing row, roster typing flag, or open turn. |
| `primaryActionIntent` | `"send" \| "steer" \| "queue"` | What Enter does now. |
| `input`, `replyTo` | | Composer draft. |
| `pendingSendCount` | `number` | Sends in flight ("Sending…"). |
| `afterTurnMessageIds` | `Set<string>` | Messages sent with `metadata.deliverAfterTurn`. |
| `flushNarration` | `{ text, remaining } \| undefined` | Outcome of the last flush (shown ~4 s). |
| `undoableAction` | `{ kind, messageIds, expiresAt, textOnlyRestore? } \| undefined` | Undo window after cancelling queued messages (5 s). |
| `debugEvents`, `dirtyRepoWarnings`, `pendingAgents` | | Agent lifecycle diagnostics and "starting" badges. |

`ChatMessage` (from `@workspace/agentic-core`) is the rendering model: `kind`
(`message`/`system`/…), `contentType` (`text`, `thinking`, `typing`,
`invocation`, `inline_ui`, `custom`, …), `content`, `complete` (false while
streaming), `invocation` (tool card payload), `approval`, `task` (subagent),
`receipts`, `retracted`, `editedAt`, `error`, `attachments`, `senderMetadata`.

### Methods

Connection
- `start()` — begin the owned join loop (transient failures retry with a
  bounded backoff; terminal ones stop and stay in `connectionError`). Idempotent.
- `reconnect(reason)` — the single re-entry point: `"user-retry"` always
  rejoins; `"host-unblocked"` and `"options-changed"` retry only when not
  connected. Use `"host-unblocked"` when something that blocked joining may have
  resolved (a workspace review, model settings recovering).
- `connect(options)` — one join with explicit options and no retry (hosts that
  own their lifecycle, e.g. `HeadlessSession`). `disconnect()` leaves.
- `ingest(event)` — feed one channel event (the connection does this for you).
- `registerMethods(key, provider)` — advertise a method group on the next join
  (see *Method providers*).
- `retain()` / `dispose()`.

Composer and outbox
- `setInput(text)`, `setReplyTo(id | null)`, `clearComposer()`,
  `onComposerCleared(listener)` (attachment owners clear their tray).
- `submit(attachments?, { mentions?, replyTo?, metadata? })` — **what Enter
  should call**: routes through the first-agent flow (holds the first message
  until the agent it spawns joins), otherwise sends.
- `sendMessage(attachments?, options?)` — send the draft now. Clears it
  optimistically; a rejected send restores it beside any newer draft and
  rethrows. An accepted send is never retried.
- `publishText(text, options?)` — publish without touching the composer
  (`tier`, `idempotencyKey`, `mentions`, `replyTo`, `metadata`, `attachments`).
  Rejects when not connected.
- `editPendingMessage(id, text)`, `cancelPendingMessage(id)` (opens the undo
  window), `undoLastAction()`.
- `flushOutboxAndInterrupt()` — Esc Esc: pause busy agents with
  `flushDeferred` and narrate the outcome.
- `interruptAgent(participantIdOrHandle)` — Esc.
- `loadEarlierMessages()`, `maybeSetDefaultTitle(text)`.

Agents, tools and methods
- `addAgent(agentId?, config?)`, `prepareAgent(agentId, config | null)`,
  `replaceAgent(participantId, agentId?, config?)`,
  `persistAgentModel(participantId, model)`, `removeAgent(handle)` — host agent
  management bound to this channel. `canManageAgents` tells whether the host
  supports it.
- `cancelInvocation(invocation, senderId)` — stop a tool call (an `eval` is
  cancelled through the agent that runs it).
- `callMethod(participantId, method, args)` (fire and forget) and
  `callMethodResult(...)` (await the payload) — e.g. `getAgentSettings`,
  `setModel`, `setThinkingLevel` on an agent participant.
- `resolveOpeningRequest("deliver" | "cancel")`.
- `addPendingAgent`, `setPendingAgentInfos`, `removePendingAgent`,
  `dismissDirtyWarning`, `dismissConnectionError`.

### Delivery modes

`stream` (default) consumes a response-owned event stream; use it in a browser
or a CLI process. `resident` is for Durable Objects: the channel calls back into
the owning DO with finite deliveries, and the join requires
`config.rpc.registerResidentSession` (the DO runtime's registrar). Both modes
feed the same `ChannelViewFeed`, so streaming deltas, replay and paging behave
identically. A sender never receives its own publications back in either mode;
`sendMessage`/`publishText` read them back by sequence.

### Method providers

A participant advertises channel methods that agents can call as tools.
Register each feature's group:

```ts
const unregister = session.registerMethods("feedback", () => ({
  feedback_form: {
    description: "…",
    parameters: FeedbackFormArgsSchema,           // from @workspace/pubsub
    execute: async (args, ctx) => showFormAndWait(args, ctx.signal),
  },
}));
```

Providers are read when a join starts, so the method surface is fixed per join;
a later registration takes effect on the next (re)connect. Two providers
claiming the same method name fail the join loudly. Advertise only what the
client can honour: agents fall back to text for everything else. The browser
panel registers `inline_ui`, `load_action_bar`, `inspect_card`, `client_eval`
and `feedback_form`/`feedback_custom`; a terminal should register
`feedback_form` only.

## `session.deferredAgent` — first-agent setup

`DeferredAgentMachine`, owned and fed by the session. Snapshot:
`{ deferredAgent: DeferredAgentState | undefined }` (`undefined` when the flow
is inactive and nothing is queued).

| `DeferredAgentState` | |
| --- | --- |
| `active` / `setupActive` | The flow owns adding the first agent / show the inline setup (model, thinking, approval…). |
| `launchStage` | `"preparing-model"` → `"creating-agent"` → `"joining"` → `"ready"`, or `"failed"`. Show it with `launchStageLabel(stage)`. Each stage is a lifecycle fact (model discovery/choice, the host's create call in flight, the created agent not yet in the roster, the agent present). |
| `launchError` | `UserFacingError` when the launch failed; `retryLaunch()` tries again. (`launching`/`launchFailed` remain as booleans.) |
| `setupRequired` | Set when `startQueued()` cannot start: `{ reason: "model-needs-setup" \| "no-model-selected", modelRef?, title, message }`. Render it beside your model setup action; changing the model clears it. `startQueued()` never silently does nothing. |
| `modelSelectionRequired` / `modelDiscoveryPending` | The user must choose a model / discovery is still running. |
| `queued: PendingDelivery[]` | Messages held until the agent joins. Each has `status` (`queued`/`delivering`/`failed`/`waiting`); a failed item has `failure` (`UserFacingError`); later items are `waiting` with `waitingOn` naming the failed item, because delivery keeps order. |
| `retryDelivery(id?)`, `discardQueued(id)` | Retry one failed item (or all, without an id) with the same idempotency key; discard an item (for the opening request this cancels it on the channel). `cancelQueued(id)` is the same as `discardQueued`. |
| `deliveringId`, `deliveryError` | The item being published / the first failure's raw text (compatibility). |
| `draft`, `setDraft(draft)`, `agentId`, `setAgentId(id)`, `availableAgents` | The inline config. |
| `startQueued()` | Confirm the draft and start the agent for a held message. |

Helpers: `draftForAgent`, `draftToConfig`, `pickDefaultModel`,
`spawnConfigFromDraft`, `launchStageLabel`.

## `session.forks` — fork lineage

`ForkLineageStore` (only when `forkNav` was supplied). Snapshot is a
`ForkUiState`: `provenance`, `currentLabel`, `children`/`siblings`
(`ForkEntry` with live `headSeq` and `unread`), `parent`, `forking`, `error`,
`refresh()`, `loadTree()` (`ForkTreeNode[]`), and `actions`:
`forkFromMessage(msg)`, `editAndForkMessage(msg, text)`, `newFork()`,
`renameFork(entry, label)`, `archiveFork(entry)`, `switchTo`, `openInNewPanel`,
`markForkRead`, `readForkCursors`, `clearError`, `reportError`,
`retryLiveUpdates()`. When the live lineage stream stops,
`liveUpdatesInterrupted` is true and `error` explains it; it resumes on the
client's reconnect or on `retryLiveUpdates()`.
`ForkNavHandlers` is what the host supplies: `switchTo(channelId, contextId)`,
`openInNewPanel(...)`, and optionally `readForkCursors()`,
`markForkRead(channelId, headSeq)` (back these with
`ChatHostController.readForkCursors`/`markForkRead`) and `onExternalFork(fork)`.

## `ChildTranscriptStore` — a subagent's transcript

```ts
const child = new ChildTranscriptStore({
  connection: { config: session.options.config, metadata: session.metadata },
  channelId: task.channelId,
  contextId: task.contextId ?? null,
});
const release = child.retain();     // opens an observer connection
// snapshot: { messages, participants, selfId, loading, error, failure, hasMoreHistory, loadingMore }
child.retry(); child.loadEarlierMessages();
```

A failure ends `loading`; `failure` (`UserFacingError`) carries the copy and
detail, and `retry()` starts a new attempt.

## `ChannelSignalsStore` — transient signals

`new ChannelSignalsStore(client, { maxSignals = 5, ttlMs = DEFAULT_SIGNAL_TTL_MS })`; snapshot is
`readonly ChannelSignal[]` (`{ id, ts, content, contentType }`), e.g. an agent's
"working…" status.

## `ChannelViewFeed` — the reduction itself

Used by the session, the child transcript store and quickfire; use it directly
only to render a channel you do not join as a chat participant.

- `ingest(event)` — reduce one client event.
- `attach(client)` — bind paging and replay readiness for this generation.
- `follow(client)` — `reset` + `attach` + consume `client.events()`; returns
  the release.
- `reset(channelId?)`, `loadEarlierMessages()`,
  `backfillAfterLocalPublish(pubsubId)`, `view` (latest reduced state).
- Snapshot: `{ view, messages, actionBar, messageTypes, hasMoreHistory,
  loadingMore, hasOpenTurn, replaySettled, error }`. The paging anchor is the
  lower of the oldest envelope seen and the client's `firstEnvelopeSeq`; a page
  that claims more history without advancing it sets `error`.

## `ChatHostController`

```ts
new ChatHostController(ports: ChatHostPorts)
```

Ports (required: `rpc`, `contextId`, `state`, `instanceId`; the rest optional):

| Port | |
| --- | --- |
| `rpc.call` | Host `main` services and workspace Durable Objects. |
| `contextId` | Workspace context agents are created in. |
| `state: StateArgsPort` | Durable host state (below). |
| `instanceId` | Unique per host instance; scopes recovery keys. |
| `waitForReview(approvalId)` | Resolve when a workspace review is decided. |
| `connection` | `{ status(), onStatusChange() }` of the rpc transport; model settings are re-read after a reconnect. |
| `notify({ type, title, message? })` | Failures of user actions that no snapshot field renders (e.g. removing an agent). Never used for snapshot errors. |
| `onWorkspaceEvent("approvals-changed" \| "workspace-config-changed" \| "units-changed", handler)` | Event subscription. In a panel these are `shell-approval:pending-changed`, `workspace:config-changed` and `workspace:units-changed`. A DO host can subscribe to the same events, or omit the port and rely on the `retry*()` methods. |
| `localModels` | `{ installModel(ref), onChange(handler) }` when the local-models extension exists. |
| `recoveryCoordinator` | Re-run work after transport recovery. |
| `randomUuid()` | Id source (tests). |

`StateArgsPort` = `{ get(): ChatHostState; patch(partial): Promise<void>;
subscribe(listener): () => void }`:

- `get()` is synchronous and returns the latest committed state; the controller
  re-reads it for every decision, so concurrent writers are never clobbered.
- `patch()` resolves once durable; `null` deletes a key. If it rejects with a
  pending workspace review, the controller retries after the review resolves.
- `subscribe()` reports every change, including the controller's own.
- `ChatHostState` = `{ channelName?, installedAgents?: InstalledAgentRecord[],
  agentSource?, agentClass?, agentConfig?, systemPrompt?, systemPromptMode?,
  forkCursors? }`. Other keys you keep beside them are left untouched.

A Durable Object backs it with `ctx.storage.get/put` and a local listener set:

```ts
function createStoragePort(storage: DurableObjectStorage, initial: ChatHostState): StateArgsPort {
  let current = initial;                       // load once before constructing the controller
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    async patch(partial) {
      const next = { ...current };
      for (const [key, value] of Object.entries(partial))
        if (value === null) delete (next as Record<string, unknown>)[key];
        else (next as Record<string, unknown>)[key] = value;
      await storage.put("chat-host", next);
      current = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}
```

Snapshot (`ChatHostSnapshot`): `channelName`, `availableAgents`,
`modelCatalog`, `workspaceDefaultModelRef`, `workspaceDefaultAgentConfig`,
`effectiveDefaultAgentConfig`, `firstAgentModelPreflight`
(`"checking" | "ready" | "selection-required"`), `modelSettingsError` and
`agentCatalogError` (`UserFacingError | null`),
`recovery: { status: "idle" | "recovering" | "failed"; error: UserFacingError | null; missing: string[]; attempt: number }`,
`connectionRetrySignal` (advances when joining may have been unblocked).

The controller never polls. The agent catalog and installed-agent recovery run
once per trigger: start, `approvals-changed`, `workspace-config-changed`,
`units-changed`, transport reconnect, an agent leaving the channel
(`onParticipantsChanged` / `notifyParticipantsChanged`), or an explicit
`retryAgentCatalog()` / `retryAgentRecovery()`. A failed recovery stays
`failed` with a user-facing error until the next trigger. An empty catalog is
not an error: the next `units-changed` refills it.

`controller.actions` holds the agent members of `AgenticChatActions`
(`onAddAgent`, `onPrepareAgent`, `onReplaceAgent`, `onRemoveAgent`,
`onPersistAgentModel`, `onInstallLocalModel`, `onConnectModelProvider`,
`onSaveDefaults`, `onListTaskRules`, `onResetTaskRules`, `onParticipantsChanged`);
`chatHostActionData(snapshot)` gives the data members. Spread both into a
session's `agentHost`. Direct methods: `loadModelSettings(refresh?)`,
`retryModelSettings()`, `retryAgentCatalog()`, `retryAgentRecovery()`,
`notifyParticipantsChanged(ids)`, `saveDefaultAgentConfig()`,
`connectModelProvider()`, `installLocalModel()`, `readForkCursors()`,
`markForkRead()`.

## Timing (product behaviour, not watchdogs)

| | |
| --- | --- |
| Streaming deltas | projected at most every 33 ms (`DELTA_COALESCE_MS`) |
| Replayed history | projected once at the replay boundary |
| Undo window | 5 s (`UNDO_WINDOW_MS`) |
| Flush narration | 4 s (`FLUSH_NARRATION_MS`) |
| Transient join failures | retried at 250 ms doubling to 5 s; terminal failures are not retried |
| Signals | expire after `DEFAULT_SIGNAL_TTL_MS` (8 s), shared by every client |
| Host: bootstrap re-persist while a review is pending | 5 s |
| Host: local-model change bursts | debounced 500 ms |
