# Compare and merge

One engine handles child events, cross-context work, external deltas, and
publication revalidation. It compares file and repository state at stable IDs.
Recorded operations explain that state and stay walkable as provenance; the
engine never replays them.

## Choose the comparison direction

For this context's complete working state, including uncommitted
applications, use the local view. It uses the working head as source and
protected main as target, so no status or history call is needed:

```js
vcs({ operation: "compare", view: "local" });
```

Compare is read-only. It takes only a source selector and optional paging and
filter fields; `intent` belongs on authoring and merge calls.

To preview committed work from another context, name that event as the
source:

```js
vcs({ operation: "compare", source: "event:source", limit: 500 });
```

The source is always the state whose changes you are reviewing. A source
already in the target's history has nothing to integrate: compare refuses it
with `SourceIsAncestor`, whose recovery is the local view. Both forms return
the same coordinate, intent,
attribution, and resolution model. Only committed incoming events can be
merged; local applications are already present and are committed or
discarded.

## Read the coordinate view

Compare returns a primary common base, any additional maximal bases, global
counts and resolution, a page of coordinates, and a bounded list of intents.
Paging never changes the global classification or intent state.

File aspects are presence, content, placement, and mode; repository aspects
are presence and path. Each aspect has `base`, `ours`, `theirs`, attribution
for both sides, and one classification:

- `adopt`: only the source changed it;
- `ours`: only the target changed it;
- `convergent`: both sides reached the same value independently;
- `composed`: orthogonal aspects or non-overlapping text hunks combine
  deterministically;
- `conflict`: a decision is required.

Presence takes precedence over edit and move. A structural conflict names
every coordinate involved. A `group` marks coordinates that form one
structural unit, such as a file placed in a repository the source created, or
a chain of path vacancies.

If maximal common bases disagree on an aspect, it is a conflict with
`baseValues`; the engine never picks a base silently.

## Read the intent view

`intents` groups attribution by work unit. Missing evidence lowers the tier
rather than being invented:

1. `stated`: explicit authoring intent or a recorded work-unit summary;
2. `trigger`: an excerpt of the request, attributed to its sender;
3. `mechanical`: a labeled summary of the effect.

Source intent states:

- `merged`: every touched coordinate is mechanically incorporated or
  convergent;
- `settled`: all are resolved, at least one explicitly kept or superseded;
- `split`: some coordinates are clean and others contested;
- `contested`: all are conflicts;
- `pending`: cleanly mergeable but not concluded.

Review `split` first. These states direct attention; they never block a
mechanically valid merge.

## Merge clean coordinates

A merge call produces at most one result per coordinate and records a
decision even when no facts change. Without a coordinate list, the service
selects the first mergeable page. Conflicts are never selected implicitly.

With the agent tool, merge directly: it derives the live target, works through
every clean page, and returns a complete review packet. Don't compare before
or after a clean merge; compare is for previews and for paging through
conflict evidence.

```js
vcs({
  operation: "merge",
  source: "event:source",
  intent: "Bring the reviewed source behavior into this context",
});
```

Direct service callers pass the source as `{ kind: "event", eventId }` or
`{ kind: "external-delta", deltaId }`. The compact tool takes either ID, or a
returned semantic `@ref`, in its `source` field. For an external delta
returned by another workspace operation, also pass that operation's retained
context:

```js
vcs({
  operation: "merge",
  contextId: "the-retained-context-id",
  source: "external-delta:the-external-delta-id",
  intent: "Integrate the reviewed contribution",
});
```

`contextId` is optional and selects an existing retained context; it defaults
to the current task context.

Always read the `composed` entries in the result. Each names the coordinate
and both resolved intents; the full packet is in structured details.
Hunk-composed content is a new authored merge change whose content maps to
both parents.

The result's `status` is `working` (with mutation IDs) or `unchanged` (with
none). Both include the final `resolution`, `counts`, `intents`,
`intentsTruncated`, one page of conflicts, and an optional continuation. To
continue, call agent-facing `compare` with only the advertised compact `ref`,
which keeps the source, target, conflict filter, and cursor. Filtered and
unfiltered page streams are not interchangeable.

## Resolve a coordinate

A resolution covers the whole unresolved coordinate; aspects only explain the
conflict.

- `composed`: accept the deterministic combined result of a `composed`
  coordinate.
- `theirs`: accept the source result.
- `ours`: keep the target result and record an explicit decline.
- `current`: accept the current head. Write the correct combined result with
  `edit` or `write` first; the resolution records only the decision link and
  creates no empty change.

```js
vcs({
  operation: "merge",
  source: "event:source",
  resolutions: [
    {
      coordinate: { kind: "file", id: "file:config" },
      resolution: "current",
      rationale:
        "The current value combines the source retry policy with local schema validation",
    },
  ],
  intent: "Conclude the reviewed config merge",
});
```

To take only part of a clean source, resolve the unwanted clean coordinates as
`ours`; coordinates you leave out stay pending.

To decide everything remaining at once, use
`resolutions: { allRemaining: { resolution: "ours" } }`, or `current` with a
required rationale. The driver repeats it page by page until the source is
concluded. It covers clean coordinates as well as conflicts and can't be
combined with an explicit coordinate page. There is no blanket `theirs`:
adopting unseen source state is always per coordinate.

## Completion and ancestry

`complete` means every coordinate the source touched is mechanically
satisfied or has a reachable decision. `concluded` means a reachable decision
names the source, or the source is already an ancestor. Compare never
concludes a source.

A conflict-only source needs merge decisions. A complete but unconcluded
source (`complete: true, concluded: false`: all-convergent or net-zero) is
concluded by the commit that names it, atomically with the commit:

```js
vcs({ operation: "commit", message: "Conclude the reviewed child", concludes: "event:source" });
```

Commit refuses with `IntegrationIncomplete` if the named source still has
undecided coordinates; it never concludes a source on its own. Commit derives
the source parent from the recorded decisions. Repeating a
completed merge returns `unchanged` and creates nothing.

## Typed refusals

- `ConflictPresent`: you selected a conflicted coordinate without resolving
  it.
- `CoupledGroupIncomplete`: the selection splits a returned group.
- `RevisionChanged`: the target head moved; merge again from the new head.
- `IntegrityFailure`: recorded operations can't account for the state
  difference. Stop and diagnose the graph.
