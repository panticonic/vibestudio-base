# Contexts and state nodes

## Orient from status

Call `vcs.status` when you need to see the chain. Agent-facing mutations bind
the live working head themselves, and
`vcs({ operation: "compare", view: "local" })` resolves its own source and
protected-main target, so neither needs status first. Status returns:

- `committed`: the context's immutable committed event;
- `workingHead`: that event when clean, otherwise the latest local
  application;
- `clean`: whether there are local applications;
- `mainEventId` and the context's relation to protected main;
- counts of local applications, work units, and changes.

Keep the returned state object unchanged. A state node is an event or an
application, not a content digest, filesystem marker, or permission. Its
`workspace-event:…` or `application:…` ID is one opaque string; never strip,
split, hash, or rebuild the prefix.

## Advance one local step at a time

Every successful `edit`, `move`, `copy`, `merge`, or `revert` appends one work
application and returns the new `workingHead`, which you pass as the next
mutation's `expectedWorkingHead`. The chain is linear within a context:

```text
committed event -> edit application -> merge application -> revert application
```

Work that needs its own chain belongs in another context.

## Run context code from the same working state

A context is a branch across every repository in the workspace, not a
repository, directory, vault, channel, panel, or agent. Selecting a
repository or vault changes focus within the branch; it never creates or
switches contexts.

The host binds each panel to one context. Agents launched by the panel, and
channels they serve, use the same context; panel state arguments can't
override it. Create a separate branch only with an explicit fork, clone, or
subagent operation. To show an existing branch in a panel, open the panel with
that `contextId` or use its context-switch operation; don't store a second
context ID in application state.

Runtime-managed workers and Durable Objects follow their context's working
head by default, so their code and stored state stay in the context while
work is local. Pass `ref: "main"` only to deliberately pin protected main, not
to work around a context build problem. Panels build from their own context
by default; open one with `contextId` set to the context whose unpublished code
you are testing.

A host checkout is not a semantic selector. Editing or restarting host source
doesn't move workspace `main`, rewrite a context, or rebind an image. Diagnose
runtime provenance from the selected event/application and image state, not
from checkout modification times.

## Read a specific state

Pass an event or application state directly to `resolveRepository`,
`readFile`, `readFiles`, `listFiles`, `compare`, file/repository roots, and
`blame`. Paths help you find stable IDs; they don't name revisions.

`vcs.readFile` always reads semantic state and has no raw or host form. Use
`fs` for bytes at a host or materialized path. A context filesystem read may
check its projection marker first, but never falls back to VCS.

Responsibilities, with no VCS authority service in between:

- semantic VCS: events, applications, IDs, and provenance;
- `fs`: host reads and materialized bytes;
- the publication gate: compare-and-swap of protected refs.

Repairing the on-disk projection re-derives it from existing semantic state;
it is not new semantic work. Normal mutations write a patch against the known
basis for the repositories they changed. Recovery derives a self-contained
full replacement for the current working head against the host state (or
absence) it observed, so a delayed replacement can't roll back a newer
projection. Recovery doesn't replay or re-acknowledge an old partial effect or
create a semantic command, work unit, or event.

With a known repository path, use `resolveRepository`, then `listFiles`. Use
`neighbors` from an event or application root only when the path is unknown.
In an agent, walk through `provenance` with compact `ref`s, following each
advertised continuation until you find the ID; the harness carries the root
and cursor. Don't settle for whatever is on the first page.

A placed file reports `contentKind`, `byteLength`, and `coordinateExtent`.
`contentKind` sets the range unit (`text` → UTF-16, `bytes` → byte). Carry
these facts forward; don't add unit metadata to `blame` requests.

## Commit, discard, and compare

`commit` turns the complete local chain into a new event. `discard` drops the
complete chain and restores the committed event as working head. Neither
accepts a subset.

Local compare shows this context's full working state, including uncommitted
applications, against protected main. Incoming compare reviews another
context's work, with a target state and a committed source event. The source
is always the state whose changes you are considering; don't name main as the
source to ask what changed locally.

Keep the same incoming source event across all coordinate decisions, and
commit only after every effective source change is accounted for. Commit
derives the merge parents from those decisions; it has no parent input. Local
applications are already in this context: you inspect or commit them, not
merge them.
