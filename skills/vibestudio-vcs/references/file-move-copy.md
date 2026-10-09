# File move and copy

## Move or copy?

Move when the same managed file changes location. The file keeps its `fileId`
across path or repository changes.

Copy when a new managed file starts from a source file's content. The copy
gets a new `fileId` and records one direct coordinate mapping to the source
file at the named source state.

That whole-file mapping uses the unit of the source and destination states:
UTF-16 for text, bytes for opaque content. Copy doesn't accept a coordinate
kind from the caller or convert between content kinds.

Don't express either operation as delete plus create, byte similarity, or a
generic filesystem transfer on managed paths.

## Resolve both endpoints

Call `status`, find the source and destination repository IDs, and read or
list the source file at the working head. Keep its `fileId`.

For a move, supply the current repository and file IDs plus the destination
repository and a vacant path. For a copy, also keep the source state. Copying
from an older event is allowed and stays explicit.

Use the `move_file` and `copy_file` tools for a single file. Add `intent` when
the transfer has a purpose the request doesn't reveal, for example
`intent: "Keep the generic adapter while creating a panel-owned variant"`.
Don't fill it with the source and destination paths. An agent-bound relay
must keep the causing invocation. An authorized direct client may use
`vcs.move` or `vcs.copy` for an atomic batch; its provenance ends at the
command. Don't wrap it in a synthetic agent.

Each request creates one local application; keep the returned working head
for the next step. Results from `move_file` and `copy_file` include complete
`source.root` and `destination.root` values and full workspace paths. Pass
those roots unchanged to compact `inspect`/`neighbors` instead of building a
file coordinate yourself.

## Verify provenance

After a move, inspect the file root at the returned state and confirm the same
file ID has the new placement. Its content lineage is unchanged.

After a copy, find the destination file ID, then call `blame` or walk the two
relations, which are deliberately separate:

- `authored-copy-source` links the copy change to the source file at the
  selected event or application state;
- `copies-content` links the copy's applied change to the source's applied
  change, with the coordinate mappings blame uses.

The authored source is a typed change endpoint, not a payload convention or a
second copy-source graph. A copy of a copy walks one `authored-copy-source`
fact and one applied content mapping per generation; the new change does not
store a transitive list of sources.

Later edits to the copy create new content, while unchanged regions still
trace through the copy edge. Editing the original does not change the copy.

## Handle refusal

`DestinationOccupied` means the destination is not vacant. Re-read the
destination and choose a different operation; don't overwrite it silently. On
`RevisionChanged`, resolve both endpoints again, because IDs or placement may
have changed.

When the source is outside managed semantic history, use `vcs.importSnapshot`
instead of copy, so it enters through an explicit external snapshot work unit.
