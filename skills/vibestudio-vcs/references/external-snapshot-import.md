# External snapshot import

## Import one snapshot

Use `vcs.importSnapshot` when content from Git, an archive, an upload, a
filesystem tree, or a generator enters semantic history. One import creates
one work unit with `kind: "import"` (which requires an `externalSnapshot`
value) and one committed event over complete repository trees. The recorded
differences are normal changes: repository create, file create/delete/mode,
and whole-content replacement. There is no special barrier change or separate
import graph.

Provide only the source information you can prove:

- source kind and canonical credential-free URI;
- snapshot revision;
- complete repository trees, with each file's canonical path, content hash,
  and mode.

The host content store verifies the named CAS digests and returns each blob's
content descriptor without sending the blobs into semantic execution. Callers
don't state content kind, byte length, or coordinate extent, and don't supply
a root, tree hash, or snapshot digest. The semantic workspace validates the
host receipt, adds each observed descriptor to its file fact, and derives a
canonical `snapshotDigest` from the complete normalized facts.

The work unit stores `sourceKind`, `sourceUri`, `snapshotRevision`, and
`snapshotDigest` together. They record which snapshot the importer observed
and which verified descriptors came in, at snapshot granularity. They are
observations, not a cryptographic identity, authorization, or native
authorship, and say nothing about who wrote any path before the import. Never
put a checkout path, embedded credentials, access token, or signed query
parameters in the source URI. For Git, use the credential-free remote URL; a
local-only remote is represented by an opaque digest, not its path.

The snapshot also stores the sorted IDs of every targeted repository, even
for an identical re-import that changes nothing. Work-unit inspection returns
them as `targetRepositoryIds`, and `imports-repository` neighbors expose them
as edges. Don't infer targets from authored-change previews, which are bounded
separately and may be empty.

Read the external source through `fs` so its digests are in the workspace
CAS. `vcs.importSnapshot` takes the complete repository and file facts; it
doesn't accept caller content descriptors, a caller root, or a raw host path,
and never reads the filesystem itself.

An import is one atomic transaction regardless of size. Repositories and
files must be in canonical path order. Manifest reads are paged internally,
so database limits don't leak into the contract. A path component may be at
most 255 UTF-8 bytes and a file path at most 512; these are path-identity
limits, not capacity limits. There is no descriptor-size or item-count limit,
upload session, chunking, or partially visible import.

One shared path check applies at schema ingress, semantic resume, external
adapters, host scans, and materialization. `.git`, `.gad`, the materializer's
context-binding file, and credential-bearing filenames such as `.env` can
never enter semantic state, because common tools read those names
automatically and materializing them could expose credentials. Configuration
such as `.npmrc` is normal tracked source (secrets belong in the credential
store), as are templates such as `.env.example`. `dist/`, `out/`, `release/`,
`coverage/`, `.cache/`, `node_modules/`, logs, archives, and environment
templates are not excluded by convention.

Imports have no evidence-quality mode, per-path last-touch data, imported
author, or external commit graph. Don't walk Git history to make an import
look more complete; a shallow clone that identifies the revision and tree is
enough. If a separate Git query says a commit last touched a path, call it
external path-level evidence, not Vibestudio line blame; the import doesn't
store it. Blame stops at an import boundary when its terminal change belongs
to an import work unit.

Classification depends only on the bytes. The whole blob is decoded as strict
UTF-8. On success it is text: `byteLength` is the byte count and
`coordinateExtent` the UTF-16 code-unit length. Any malformed sequence makes
it opaque bytes, with equal byte length and coordinate extent. Extension, MIME
type, NUL heuristics, replacement decoding, and caller overrides play no part.

## Prepare the import

An agent should import from its actual tool invocation, so the graph reads
trigger message → turn → invocation → semantic command → import work unit →
changes. An authorized direct import ends at its semantic command. Don't
create a wrapper agent or synthetic adapter invocation.

Import needs a clean context, because it creates a committed event directly;
commit or discard local applications first. Supply the current working head,
a globally unique command ID, the source fields, and the complete repository
and file facts. Raw bytes never enter semantic execution.

For a new repository, omit its ID and give a vacant workspace path. For a
later snapshot of an existing repository, give its ID. The manifest is always
complete, not a patch: only differences from the current basis become
changes, and unchanged files get none.

A whole-content replacement records before and after endpoints but no
preservation mapping; similar bytes don't prove continuity. Import changes
use the normal vocabulary, so they appear in compare pages, merge page by
page, and revert without any import-specific workflow.

## Verify the result

A successful return confirms the committed import and must include
`contextId`, `eventId`, `applicationId`, `workUnitId`,
`importedRepositoryIds`, and the complete `externalSnapshot`. Don't accept an
event-only result or reconstruct the rest afterwards. Check that:

- `externalSnapshot` has `sourceKind`, `sourceUri`, `snapshotRevision`,
  `snapshotDigest`, and the sorted `targetRepositoryIds`;
- `importedRepositoryIds` names the same repositories;
- the event, application, and work unit inspect correctly, and the stored work
  unit has the same snapshot;
- `imports-repository` neighbors list the same targets;
- the authored changes have the expected repositories and file states, and
  each placed file reports `contentKind`, `byteLength`, and
  `coordinateExtent`.

For a vague question like "who changed this line, and what do we actually
know?", run bounded blame and follow native mappings. When a span stops at an
import boundary, pass its terminal `change` root unchanged to `inspect`, then
its `workUnit` and `command` roots. Report the four snapshot fields, the
recorded intent summary, and any later native intent the graph proves. Reach
the work unit through the change's ownership field, not a bounded
authored-change preview. Say plainly that pre-import authorship is unknown.
Issuing the import command doesn't make the importer the author of the
external bytes, and neither the external revision's committer nor the source
system should be named as author.

Retry an identical uncertain import with the same command ID. Any change to
the source fields, repository or file facts, or expected working head needs a
new command ID.
