# Managed authoring

## Use the runtime client

In eval and runtime code, use the `vcs` client rather than raw RPC:

```ts
import { contextId, vcs } from "@workspace/runtime";

const status = await vcs.status({ contextId });
const repository = await vcs.resolveRepository({
  state: status.workingHead,
  repoPath: "projects/example",
});
```

Each method takes its documented request object directly. If a direct RPC call
is needed, pass the canonical descriptor from
`@vibestudio/service-schemas/mainRpc` and its argument tuple, for example
`rpc.call("main", mainRpcMethods["vcs.status"], [{ contextId }])`. In a chat
turn, prefer the compact `vcs` tool (including commit), `apply_patch` for
multi-file changes, and the `write`, `edit`, `move_file`, and `copy_file`
tools.

## Find identities before changing them

Call `vcs.status` and keep its `workingHead`. Resolve a known repository path
at that state with `vcs.resolveRepository` (`null` means it doesn't exist
there), then call `vcs.listFiles` with the returned `repositoryId`. Don't scan
state neighbors to turn a known path into an ID. Each file entry has
`repositoryId`, `fileId`, path, content digest, authoring change and
work-unit IDs, persisted `contentClass` and `externalKeys`, mode,
`contentKind`, `byteLength`, and `coordinateExtent`.

Inside an agent, browse with `ls`, `find`, and `read`. They use the same
context-scoped filesystem as the injected `fs` in eval and resolve semantic
state behind the scenes. Use full workspace paths for compact `blame`. Get
typed semantic roots from semantic operations; don't use VCS as a second file
browser.

Read a managed file with `vcs.readFile` at the same state, selecting it by
file ID once discovered (use a path only to find the ID). `null` means the
file doesn't exist at that state. The method is semantic-only: always pass
`state`, `repositoryId`, and a typed file selector.

Use `fs` for host or materialized paths. VCS has no raw variant and never
falls back to disk.

## Read-time memory

A plain `read` of managed text also returns memory. After reading the bytes,
the harness calls `vcs.readMemory` with the displayed UTF-16 range and the
bytes' content hash. The service attaches memory only for that working-head
file state. If the state moved, it reports a stale read in structured details
instead of attaching history for other bytes or adding warnings to the file
content.

The visible **workspace memory** block explains why the displayed lines exist
with tier-labeled intent, merge-arrival context, separately labeled commit
evidence, and intent-annotated file history. It samples for coverage, puts
surprising work before routine work, collapses the reader's own work, and
offers compact continuations; the harness keeps the content IDs and service
cursors. It is a view over GAD facts, not a separate claims store.

Don't ask the model to pick a provenance level or recall keywords before
reading, and don't repeat a graph walk the attachment already answers. Use
`provenance` only when a continuation raises a question that needs a larger
walk. Direct runtime clients may call `vcs.readMemory` with the same
path/hash/range contract; historical reads at a chosen state use
`vcs.readFile`.

## Make one local change

- `edit`: changes within one text file. Unchanged text around
  `oldText`/`newText` only anchors the match; only the UTF-16 ranges that
  differ become authored edits, so unchanged neighboring lines keep their
  provenance.
- `apply_patch`: several files that must change atomically, or a whole binary
  write, deletion, or mode change. Replacement strings are preconditions, not
  fuzzy search: on a mismatch nothing changes, and you get the current content
  hash and nearby excerpts to re-read.
- `vcs.edit`: repository creation or lower-level batches over stable IDs.

`edit` and `apply_patch` compile to the same semantic edit.

The in-agent tools record the current tool invocation as the cause. A linked
agent credential without that parent can discover and read but not author. An
authorized paired or direct human CLI can mutate without an agent parent; its
causal chain ends at the admitted command. Don't create an adapter invocation
to make direct work look agent-authored.

A direct, causally bound service request supplies:

- the current context ID;
- the expected working head;
- a globally unique command ID;
- one or more changes over stable repository/file IDs;
- `intentSummary`, only when the author gave a meaningful purpose (agent tools
  call it `intent`). Never generate one from the operation or path.

This intent is what the next reader sees, with its tier, above the changed
lines; without it the tier is `trigger` or `mechanical`.

One edit request is one work unit and one local application. Keep the
returned `workingHead`, `workUnitId`, `applicationId`, and `changeIds` if you
will inspect, revert, or explain the change later.

Text offsets are UTF-16 positions in text read from the same basis. The file
state defines the unit:

- text: `contentKind: "text"`, storage length in `byteLength`, UTF-16 length
  in `coordinateExtent`;
- opaque bytes: `contentKind: "bytes"`, with equal `byteLength` and
  `coordinateExtent`.

Re-read before computing offsets after another mutation. Don't send a
coordinate-kind hint or derive text length from byte length; the service
derives the unit and validates every range against the extent.

## Use the specific operation

- Create a repository at a verified vacant path with one `repository-create`
  change holding its complete initial file set, authored as one lifecycle work
  unit. Don't use it for an existing project, `mkdir` a managed path, or loop
  over writes to build one up.
- Create a file with a destination repository and a vacant path.
- Delete a file or change its mode by file ID.
- Use `vcs.move` to relocate a file and `vcs.copy` for a new identity with
  source lineage, never delete plus create.
- Use `vcs.importSnapshot` for content from outside semantic history; it
  records normal changes under one import work unit.

## Continue or recover

Continue from the returned working head. On `RevisionChanged`, call `status`,
re-read the relevant files, and re-plan. Retry an identical lost request with
the same command ID; any payload change needs a new one.

Check the generated [public contract](public-contract.md) or live `help`
before building a direct service request; don't infer fields from these
examples.
