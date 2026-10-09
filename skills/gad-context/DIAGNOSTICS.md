# GAD Diagnostics And Runtime State

Use this guide when agent, channel, turn, invocation, or eval state looks
inconsistent. Start with the bounded inspectors; use hydrated history APIs
only once you know the specific event, envelope, or digest. Semantic
workspace state is covered by [vibestudio-vcs](../vibestudio-vcs/SKILL.md).

If the problem is in host orchestration rather than GAD state (server
startup/shutdown, projection scheduling, RPC dispatch, workerd supervision,
reconnects, or build/reload events), read the server logs with
`services.serverLog.query(...)` or the `about/server-logs` live viewer. See
`../server-logs/SKILL.md`.

## Perspective First

In agent eval, `chat.channelId` is the channel the agent is responding in,
not a parent or sibling panel's chat. Server-side eval runs in the agent's
EvalDO: `panelTree.self()` is that EvalDO, and `getParent()` is the
owner agent's nearest visible panel ancestor, if any.

When the user asks about a visible panel:

1. Inspect the panel tree with bounded `panelTree.roots({ limit })`,
   `panelTree.children(...)`, or `panelTree.search()` reads. `roots` derives
   the verified owner; don't build a root `page()` group without an explicit
   `ownerUserId`.
2. Pick the target panel from the user's point of view.
3. Read `await target.stateArgs.get()` and take `channelName` or `channelId`.
4. Run `gad.inspectAgentHealth({ channelId })`,
   `gad.inspectTurnState({ channelId })`, and related inspectors on that
   channel.

If the target is ambiguous, render an `inline_ui` panel/channel picker
instead of guessing from the eval runtime's own position.

Don't query raw branch tables such as `trajectory_branches`; it isn't part of
the public GAD schema. If an inspector points to an artifact and SQL is still
needed, discover the current schema with a bounded read, then query only the
rows you need.

`DO_SCHEMA_INCOMPATIBLE` on an invocation means the Durable Object refused
activation before guest code ran: a schema admission failure. Use its
structured `reason`, versions, identity, and `safeActions`, and don't write a
compatibility reader. `DO_MAINTENANCE_IN_PROGRESS` likewise comes from a host
admission fence. Don't treat either as a GAD projection or
`guest_execution_failed` incident.

## Current Diagnostic APIs

### Publication Integrity

`gad.inspectPublicationIntegrity({ channelId, branchId })` checks the joins
between trajectory events and the channel envelopes they published:

- `expectedMappings`: publications declared by `external.envelope_published`;
- `missingMappings`: declared publications with no persisted join;
- `orphanMappings`: joins whose event or envelope no longer exists;
- `sequenceMismatches`: joins whose `channel_seq` disagrees with the envelope;
- `channelOriginAgenticEnvelopes`: agentic envelopes not published from a
  trajectory; usually expected, not bugs.

Only trajectory-published envelopes referenced by
`external.envelope_published` need joins; other unjoined rows are fine.

### Turn State

`gad.inspectTurnState({ branchId, channelId })` is for stuck typing, open
turns, or streaming assistant messages. It reports open projected turns,
unfinished projected messages (`started`/`streaming`; `completed` and
`failed` are terminal), unfinished projected invocations, and duplicate
`turn.opened` invariant failures.

A duplicate `turn.opened` is not recoverable: new appends are rejected, and
projection should fail loudly if one reaches the log.

### Invocation State

Use `gad.inspectInvocationState({ invocationId, transportCallId, branchId })`
when method suspension state, the invocation projection, and channel terminal
events disagree. It returns the projected row and counts of started and
terminal trajectory events, which tell you whether you have a transport or
suspension issue, a projection issue, a genuinely unfinished invocation, or a
terminal event that never reached the projection.

Agent effect suspensions live in the agent worker, not GAD. Read them, and
other activation-local agent state, with `gad.inspectAgent`; join the outbox
coordinates with `gad.inspectInvocationState(...)` yourself when terminal
state or provenance matters.

```ts
const debug = await gad.inspectAgent({ channelId, method: "getDebugState" });
const suspensions = await gad.inspectAgent({
  channelId,
  participantId: agentParticipantId,
  method: "inspectMethodSuspensions",
});
```

`method` is one of `getDebugState`, `getAgentSettings`, or
`inspectMethodSuspensions`. `participantId` defaults to the channel's sole
agent participant and is required when the channel has several. Any channel
works, not only `chat.channelId`; the call goes to that channel's read-only
`inspectAgent` receiver under its `channel.admin` gate. It uses a dedicated
activation-local agent RPC instead of `onMethodCall` and does no GAD
hydration. `getDebugState` returning `loaded: false` only means no fold is
loaded in the current activation, not that durable work is absent.

`chat.callMethod` stays the way to invoke a participant's own methods inside
`chat.channelId`; don't use it for inspection.

### Channel Envelope Inspection

`gad.inspectChannelEnvelopes({ channelId, window, limit, payloadKind })` is
the normal log inspector. It returns compact payload summaries, per-column
byte counts, stored blob-ref digests and sizes, and sender metadata
summaries.

Use `gad.readChannelEnvelopes(...)` only when you need hydrated semantic
envelopes; broad hydrated reads pull large blob refs into eval results and
bury the useful data.

Both methods page the same way:

- Omit `window`, or pass `{ kind: "tail" }`, for the newest page;
  `{ kind: "after", seq }` pages forward and `{ kind: "before", seq }` returns
  the page just before a sequence number.
- `limit` is the exact page size: default 50, zero for metadata only, at most 500. Larger requests fail instead of truncating silently.
- `payloadKind` filters both items and paging statistics.
- Both return `{ items, pageInfo }`. `pageInfo.previous` and `pageInfo.next`
  are ready-to-pass windows for the adjacent pages, absent when there is
  none. `next` carries the first page's `throughSeq` watermark, so a forward
  read stays at one high-water mark while new envelopes arrive. `pageInfo`
  also reports `totalCount`, `firstSeq?`, `lastSeq?`, `returnedFromSeq?`,
  `returnedToSeq?`, `returnedCount`, and the normalized request.

```ts
const page = await gad.inspectChannelEnvelopes({ channelId, limit: 20 });
const older = page.pageInfo.previous
  ? await gad.inspectChannelEnvelopes({
      channelId,
      window: page.pageInfo.previous,
      limit: 20,
    })
  : null;
```

To walk many pages, let `gad.collectChannelEnvelopePages` follow the cursors.
It returns the pages in ascending sequence order and fails loudly if a store
claims more data without making progress:

```ts
const pages = await gad.collectChannelEnvelopePages(
  { channelId, window: { kind: "after", seq: 0 } },
  { maximumItems: 200 },
  gad.inspectChannelEnvelopes,
);
const items = pages.flatMap((page) => page.items);
```

Write `(await call()).items`, not `await call().items`; the latter reads
`items` from the Promise.

### Storage Diagnostics

`gad.inspectStorageDiagnostics({ rowByteLimit, limit })` finds oversized
inline rows or missing blob metadata. Large payload fields should be stored
as refs; a huge eval or tool result inline in `log_events` or
`trajectory_invocations` is a storage bug.

### Channel Roster

`gad.inspectChannelRoster({ channelId })` shows join/update/leave state
projected from presence envelopes, without raw SQL: active and inactive
counts plus bounded roster rows.

### Agent Health

`gad.inspectAgentHealth({ channelId, branchId })` is the first summary for a
channel incident. It combines publication integrity, turn state, invocation
state, roster, recent envelopes, and storage diagnostics.

The summary reports two independent facts:

- `durableIntegrityOk`: publication, duplicate-turn, and storage invariants
  hold. `false` is a durable problem; the issue counters say which.
- `activity`: `idle` or `in-flight`. Open turns, streaming messages, or
  nonterminal invocations in the channel. Activity is not a failure.

Activity leaves out the caller's own work: when you inspect the channel you
are running in, `health.caller` names your eval invocation and its turn, and
neither appears in `activity`, the activity counters, or the rows. `in-flight` therefore always means other work. The
nested `turnState.summary` and `invocationState.summary` are the raw inspector
counts and still include it.

The response holds only compact evidence: problem or open turn and
invocation rows, active roster rows, a small envelope sample, and storage
issues. Use a dedicated inspector only after it names a specific artifact.
Take one snapshot. Health is not a completion signal, so don't poll it, and
don't use raw SQL or hydrate blobs to re-prove what it reports.

### Semantic workspace state

GAD trajectory branches don't hold file trees. Resolve files, events,
applications, history, and provenance through the `vcs` namespace (see
[the VCS skill](../vibestudio-vcs/SKILL.md)). A missing `vcs.readFile` result
means the file is absent; invalid or unauthorized handles return typed VCS
errors. Never join trajectory branch rows to a private worktree table or infer
ancestry from content hashes.

### Build Provenance

Use the build service to see which source artifact the runtime can see. `rpc`
is injected in `eval`, so no import is needed:

```ts
const provenance = await rpc.call("main", "build.inspectBuildProvenance", [
  "@workspace-skills/system-testing",
]);
```

It returns the resolved unit, effective version, sourcemap and production
build keys, and cached artifact metadata.

### Eval And Method Result Caps

Durable method terminal events cap oversized results before publishing: a
large `payload.result` or `payload.error` becomes an omitted-result summary
with a blobstore pointer to the full JSON. Because `payload.result` is always
a stored path, the channel encoder may store even that summary by reference;
hydrate the specific envelope to read it.

## Current Invariants

- `log_events` stores the private, branchable trajectory and channel logs.
- Publication inspectors join only trajectory-published channel envelopes to
  their private source events.
- The storage column is `payload_ref_json` even when the JSON is inline;
  there is no `payload_json` column.
- Presence envelopes are projected into `channel_roster`.
- GAD inspection is exposed through typed, bounded runtime methods, not a raw
  SQL method.
- Stored-value digests are synchronous SHA-256 over canonical bytes. Semantic
  IDs use the VCS ID constructors and protocols.

## Contexts And Source Projection

Each agent context has its own committed event and working head. Its folder
is a disposable projection with no branch or index state of its own.

When a source edit seems ignored:

1. Resolve the context working head and inspect the application that made the
   edit.
2. Confirm the whole intended chain is in the committed workspace event.
3. Check semantic publication and build evidence for that event separately.
4. Confirm the runtime activated the intended artifact, or, if build or
   activation failed, that it kept the previous runnable one.
5. Only then conclude the running code is still broken.

Builds read explicit semantic or content sources, never whatever happens to
be on disk.

## System Testing Self-Diagnostics

`@workspace-skills/system-testing` attaches `execution.diagnostics`
automatically when a test errors, including build provenance and, when a
headless channel exists, `gad.inspectAgentHealth(...)`. For failures outside
an individual test, call `runner.collectDiagnostics({ channelId, error })`.
