# Revert and counteractions

Revert records explicit inverse changes; it doesn't erase history. The
original change, its counteraction, both work units, and every later merge
decision stay reachable.

Use `vcs({ operation: "revert", changeIds, intent })` with change IDs found
through inspect, history, blame, or memory. Select semantic change IDs, not
paths or a guessed order.

```js
vcs({
  operation: "revert",
  changeIds: ["change:..."],
  intent:
    "Remove the temporary compatibility behavior now that all callers use v2",
});
```

The engine plans all selected counteractions as one mutation. If newer state
means an inverse would no longer be correct, it reports `ConflictPresent`.
Inspect the coordinate and write the result you want; don't force the old
value over newer intent.

Use `discard` only to drop the entire uncommitted application chain and
return the context to its committed event. It is not a selective undo.
