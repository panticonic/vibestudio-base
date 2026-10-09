# Theory of State

## Kinds of persistent structure

Every persistent structure is one of:

- **Log**: an append-only hash-chained sequence for trajectory and channel
  delivery.
- **Semantic graph fact**: an immutable typed node or direct edge: command,
  work unit, change, application, decision, content mapping, workspace event,
  or event parent.
- **Value**: immutable content-addressed bytes or trees for file content,
  large payloads, and build artifacts.
- **Ref**: a mutable named pointer, such as a trajectory head, a context's
  committed event or working head, or the protected `main` event.
- **Cache**: a rebuildable index, materialized context folder, or build
  output.

Never treat a cache, traversal cursor, self-derived digest, or repeated
projection as a source of truth. Journal an intended external effect before
dispatching it, and create a semantic ID before materializing its content.

## Linking the trajectory to semantic work

The unified log envelope carries log/head coordinates, ordering, causality,
actor, payload identity, and hash-chain integrity. A model-visible trajectory
holds messages, turns, tool invocations, model changes, compactions, and
summaries. Semantic file mutations aren't copied into it; the workspace graph
holds commands, work units, changes, applications, and events. The
invocation-to-command edge is the one link between them.

An agent-caused semantic command points to its verified ingress coordinate in
the trajectory; an authorized direct command ends at itself. Neither copies
actor or invocation fields into every VCS node or keeps a second invocation
registry. Executor, initiating intent, authorization, incorporation, and blame
are separate graph walks. Approvals and runtime diagnostics stay in their own
domains; there is no provenance sidecar or claims ledger.

## The semantic workspace graph

A committed state is a workspace event; a local state is the latest work
application. Each context stores two pointers:

- `committedEventId`: its immutable local commit boundary;
- `workingHead`: the committed event when clean, otherwise the latest local
  application.

Each application points to its event/application basis and applies one work
unit. Every edit, move, copy, merge decision, or revert appends one local
application. Commit turns the complete local chain into one event; discard
drops it. There is no separate composition step or partial-commit state.

One authenticated workspace fact map holds typed repository and file states.
Repository manifests map paths to stable file IDs. File state holds placement,
content, mode, size, and deletion predecessor. A content edit changes one file
fact, a move keeps the file ID, and a copy creates a new one. The copy change
stores one typed source endpoint (state, repository, file, path, and
content), from which both the `authored-copy-source` edge and each
application's mapped content edge are derived. Don't add a copy-source table,
payload convention, or copy-specific traversal graph.

Work units group changes made for one intent. Changes record edit, lifecycle,
move, copy, import, and counteraction semantics. Applications record how work
was applied to a basis. Merge decisions account for source changes by
adopting them, reconciling them with evidence from the current state, or
declining them with a rationale. Direct content edges preserve, copy, or
incorporate specific coordinates, so blame walks transitively without stored
transitive snapshots.

An import is an explicit evidence boundary: the snapshot bytes may be known
while their earlier origin isn't, and provenance stops there.

See [vibestudio-vcs](../vibestudio-vcs/SKILL.md) for the operating procedure.

## Semantics versus host effects

The semantic workspace owns contexts, events, work, changes, applications,
decisions, content lineage, comparisons, command journaling, and the durable
effect outbox.

Invocation diagnostics are a bounded read view over those records, not a
separate ledger. `gad.diagnoseInvocation` joins a trajectory coordinate to its
projected invocation and turn, terminal events, caused semantic commands,
effect intents, and receipts. Every section has an explicit limit and reports
truncation; the view stores nothing and can't change semantic state.

Two narrow host-effect ports take specific requests and return receipts:

- workspace content observation and materialization;
- approval-gated compare-and-swap of protected refs.

They don't interpret changes, conflicts, integration completeness, or
ancestry, and aren't a second VCS. The semantic workspace performs no
filesystem or protected-ref effects itself.

The build subsystem consumes content; it isn't a semantic effect port. You can
run it against a context for quick feedback, and protected publication runs
it for the affected build closure. Build results never become semantic
history; only a successful candidate gate permits the protected-ref effect.

Materialized context folders, host content-tree digests, and build keys are
all derived; none identifies a semantic revision.

## Walking provenance

`inspect`, `neighbors`, `history`, and `blame` share one typed node
vocabulary. Each relation is defined once with its allowed endpoint kinds and
reads the same from either end. Only direct normalized facts are stored, with
no second adjacency graph. Adjacency is paged in deterministic order with one
opaque cursor; the caller holds traversal state and restarts from the root if
a trajectory grows. Ancestry comes from event parents, content origin from
coordinate mappings.

If a proposed stored object only summarizes facts reachable through these
edges, make it a rebuildable cache or drop it.

## Where runtime state lives

- Durable Object SQL is the durable SQL primitive; each DO owns its schema.
- The per-workspace blobstore holds immutable content-addressed values.
- The host state directory holds DO databases, blob and build stores,
  projected context folders, and device credentials.
- Framework-internal DOs own their bounded runtime concerns. Workspace units
  gain no host authority from filesystem position.

## Build from content, publish events

Builds are content-addressed and on demand. A unit's effective version comes
from its content, transitive internal dependencies, and global build keys;
equal versions reuse artifacts. A context build is the quick local check, and
the protected-main gate repeats the candidate build and typecheck before
changing a ref. Builds after publication are derived.

Protected `vcs.push` publishes an already committed event. The semantic
workspace validates ancestry and integration facts; the publication gate
obtains approval and advances protected refs atomically. Publication creates
no source-history event, and content-changing pushes require a successful
candidate build and typecheck.

Runtime activation uses derived artifacts and fails closed. If new source
can't be built, validated, or started, its artifact isn't activated and the
previous runnable artifact stays selected. The publication still stands; the
fix is a new event.
