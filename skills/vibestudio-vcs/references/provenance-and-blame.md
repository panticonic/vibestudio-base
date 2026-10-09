# Provenance and blame

## Choose a starting point

Use roots returned by VCS responses, or build a schema-valid root with an
explicit kind: event, application, applied-change, work-unit, change,
decision, command, file, repository, trajectory, trajectory-invocation,
trajectory-turn, or trajectory-message. Never guess a node kind from an opaque
ID.

Four walk operations:

- `inspect`: one node and a bounded preview of its direct edges;
- `neighbors`: pages of a node's direct edges;
- `history`: committed event ancestry from an event root;
- `blame`: one file range traced through content-coordinate mappings.

The agent `provenance` tool starts from `target: "session"`, a managed path,
a semantic ID or shorthand, or a returned `@ref`; `target` is its only
selector. Results advertise complete compact `@ref` values. To continue, pass
the advertised `@ref` as `target` and nothing else. The ref is stored per
channel, keeps the full root, and forwards opaque service cursors unchanged.
Typed roots belong to the direct service API and are never passed to the
agent tool. Direct service clients carry `nextCursor` themselves, with the
same root and query, because the server keeps no search session.

The `provenance` tool shows the selected node's semantic fields and one page
of its edges; for a file root it also previews past history with compact
change refs and summaries. Its structured details hold only counts and
continuation refs, one stream and page per ref. Use it for orientation, and
direct VCS reads for custom edge queries, history paging, or range tracing.

## Read-time memory

When an agent reads managed text with `read`, the harness calls
`vcs.readMemory` once the bytes are known, passing the current context, the
workspace path, the hash of the returned bytes, and the displayed UTF-16
range. If the semantic state changed meanwhile, the result is `stale`, and
memory is never attached to mismatched content. Stale, unmanaged, and
temporarily unavailable results stay out of the visible file content and are
kept in structured read details for diagnosis.

The visible attachment is headed **workspace memory · why … lines … exist**.
It samples episodes for coverage, then lists merge arrivals, imports and
counteractions, others' work, and the reading context's own work (collapsed).
Intent is always labeled `stated`, `trigger`, or `mechanical`; commit messages
never stand in for it. Merge applications name their decision, and composed
content shows both parent intents. A footer gives the `provenance`,
`history`, and `blame` continuations.

The attachment is automatic and bounded: no model-chosen tier or recall
keywords, ranking store, suppression list, or copied claims. `memory_recall`
is a topic search across messages and committed files; read-time memory
answers "why do these displayed lines exist?" from the GAD graph. If the
attachment answers the question, stop. Walk further only when that could add
or contradict something.

## What the edges record

- which command caused a work unit;
- which applications apply which work, and their basis-specific applied
  changes;
- which authored change each applied change realizes;
- which work unit authored or incorporated a change;
- which coordinate decision accounts for a source attribution chain;
- which change counteracts another;
- which state and file a copy named as its source when authored;
- which content coordinates preserve, copy, or incorporate earlier content;
- which event committed which applications, and each event's parents;
- which trajectory invocation caused a command, and which trajectory contains
  it.

The causal chain is walkable in both directions:
trigger-message ↔ turn ↔ trajectory-invocation ↔ semantic-command ↔ work-unit
↔ change. Applications reach their work unit through `applies-work` and
their applied changes through `applies-change`; `realizes-change` links each
applied change to its authored change. Content-coordinate edges connect
applied changes directly, so applying one authored change twice keeps two
separate lineages.

Inspect an invocation by its full `logId` + `head` + `invocationId` endpoint;
it points to its turn, which points to the triggering message. Invocation
name, status, terminal outcome, start/completion event references, and the
immutable request blob reference are recorded facts, not an author record
passed through service calls. The command ID is globally unique and records
semantic admission and idempotency; it is not an actor credential.

Inspecting a trajectory message returns the stored text blocks and source
message and sender IDs from the sanitized trajectory log. It doesn't read a
copied VCS intent field or expose other participant metadata. Provenance reads
follow the workspace's documented mutual-trust model, like channel replay.
Mutation still requires context authorization, and agent-bound mutation also
requires its causing invocation.

Invocation inspection returns `requestRef`, not the request JSON. Inside
`eval`, read it with
`await services.blobstore.getText(invocation.requestRef.digest)`, but only
when you need the exact tool arguments and have blob-read authorization;
arguments can be sensitive. Check `size` and `originalBytes` first. For large
values use `services.blobstore.stat`, `getRange`, or `grep`, and don't copy
the full payload into the conversation or provenance. VCS neither widens blob
access nor keeps its own copy.

Executor, initiating intent, approval, content origin, and blame are separate
walks over these facts. Agent intent walks
trajectory-invocation → command → work-unit → change; application edges show
where the work was applied, and the reverse walk also works. Don't expect or
supply a single author field that answers all of these.

## Trace content

Call `blame` with a state, repository/file ID, and a bounded `{ start, end }`
range. Don't choose a coordinate kind: the placed file state determines it
(UTF-16 code units for text, bytes for opaque content). The service validates
the range against `coordinateExtent` and reports the kind once in the result.

Preserved content traces through `preserves-content`, copies through one
`copies-content` edge per generation, and hunk-composed content through
mapped `incorporates` edges to both parents' applied changes. Moves change
placement without creating content origin. It is all one applied-change
graph; blame has no separate model for copies.

`authored-copy-source` is different: it links a change to a typed file root
and records which source the copy command selected. It has no range mappings
and never appears in blame. `copies-content` is valid only between two applied
changes. Either edge reads the same from both ends.

Every lineage mapping uses the same unit on child and parent. Text edit
mappings cover only maximal spans outside the edited ranges; replacement text
that happens to equal the old text still counts as edited. A mapping that
changes units or exceeds either state's extent is an integrity failure.

Page large ranges instead of tracing them unbounded. The opaque blame cursor
is tied to the requested range and resumes at the first unreturned
coordinate. Agent-facing blame returns a compact `ref` holding the state,
file, range, page, and cursor; continue by copying the advertised
`vcs({ operation: "blame", ref })` call unchanged. Direct service clients may
reuse the cursor only with the same basis.

A blame span's `path` lists only the content-mapping route between applied
changes. Its terminal `appliedChange`, `change`, `workUnit`, and `command`
fields are typed roots, rendered by agent-facing blame as compact refs to pass
to `provenance`. Follow `realizes-change` from `appliedChange` when the
content route matters, or inspect the other roots for intent and the causing
invocation. The span also carries the terminal `workUnitId` and resolved
intent `tier`, never intent text. Treat `mechanical` as "no purpose
evidence": read the code and the work unit before trusting a purpose claim.
Spans don't repeat the causal edges.

Find the owning work unit through the terminal change's
`authoredByWorkUnitId`. Don't expect the change in a work unit's bounded
authored-change preview; page `authored-change` neighbors only when you need
full membership.

## Explain a decision

Inspect the decision and its coordinate entries, then walk the source changes
they account for back to work units, applications, commands, and
trajectories. `ours` records an explicit decline. `current` links a
hand-written result without inventing a content mapping. `theirs` or
`composed` leads to the applied result; hunk-composed results also have
`incorporates` edges to both parent chains. The entries show which
coordinates were combined mechanically and which intents they carried.

Intent always shows its tier. `stated` comes only from explicit authoring
intent or a recorded work-unit description; `trigger` is a bounded excerpt of
a named sender's request; `mechanical` is a labeled effect summary. Never
present a mechanical summary as purpose.

To trace purpose drift, page file `history` and read each change's optional
resolved `intent`. A drop to `mechanical` marks missing purpose evidence. An
intent change without `viaDecisionId` is local drift; with `viaDecisionId`
the purpose came in through a merge, so inspect that decision. Event-root
history has neither annotation.

## Import boundaries

Report only what the graph proves. Blame calls a terminal change an import
boundary when its work unit has `kind: "import"`. Inspect the change, then the
work unit, whose `externalSnapshot` gives the source kind, credential-free
URI, snapshot revision, and snapshot digest computed by the semantic
workspace. Continue to its command and causing invocation if the question is
why it was imported. When asked what intent is known, quote the work unit's
recorded intent summary rather than a plausible reconstruction.

These are snapshot-level facts, not line authorship; there is no per-path
external evidence. Say that earlier origin is outside semantic history; don't
attribute it to the importer, the revision's committer, or the current agent.
Native edits after the import keep their normal intent and causal chain.
