# Scenarios

## Child work with an undo chain

The child edits one file through several intermediate values and changes an
unrelated file. Compare reports at most one row per coordinate, while
attribution names every touch, including undone intermediate values. One
default agent-tool merge works through the clean pages. Review its final
`resolution`, `intents`, and `composed`, then commit. Don't replay the
intermediate values or compare again after the merge.

## Same-file conflict with stated intent

Parent and child both change the same file with a meaningful `intent`. Compare
reports a content conflict with both attribution chains and both `stated`
intents. The parent uses `edit` (with intent) to write the correct
combination, then merges with a `current` resolution and a rationale. The
resolution records a decision link without an empty file change.

## Net-zero child

The child changes a coordinate and restores the base value before committing.
Compare reports `complete: true, concluded: false`. Commit with
`concludes: "event:child"`: it records the decision-only application and the
commit together, lists the child as a parent, and keeps its full history
reachable through ancestry.

## External delta

Register the old-to-new delta and compare using the returned delta ID. The
declared description becomes the external work unit's `stated` intent. Merge
and resolve through the same coordinate model as for an event. Finish only
when the resolution is complete and concluded.

## Non-overlapping text edits

The parent changes the header and the child changes the footer. Compare
fetches the content, runs a deterministic three-way merge, and reports
`composed`. Merge writes the composed bytes with mapped `incorporates` edges
to both parents' applied changes. Review both intents before committing.

## Structural group

The source creates a repository and places a file in it. Compare puts the
repository and the file in one group. Select both, or let the default page
choose them. Selecting only the file returns `CoupledGroupIncomplete`; two
partial calls in a particular order won't fix it.

## Parent already combined the child's behavior by hand

Don't replay the child's edits. If the parent already correctly combines or
supersedes the child's result, call `merge_subagent` with
`allRemaining: current` and a rationale describing the reviewed combined
state. The decision covers every remaining clean and conflicted coordinate,
and the next commit records the child as a parent.

## Decline a supervised child

Call `merge_subagent` with `allRemaining: ours` to decline everything that
remains. This records a semantic decision in the parent's working chain. The
child's run ending is not a substitute for that decision. Finished child
results are kept automatically and need no cleanup.
