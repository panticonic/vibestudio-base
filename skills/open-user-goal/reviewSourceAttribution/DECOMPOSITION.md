# Review adopted workspace source

1. `discoverSourceAttribution` retrieves the current authorized question, a bounded candidate scope and the user's local receipt authority. The agent decides which files and fragments can answer it.
2. `inspectCurrentSource` delegates to `sourceFiles.readOwnedFile` to bind current bytes, typed repository/file identity, current state and coordinate extent. This helper performs scoped native IO. It does not infer attribution.
3. `traceSelectedSource` delegates to child `content.traceOwnedRange` for native branch-relative blame. It decides whether to follow native owning work, external source, copying or mixed ancestry. `intent.inspectOwnedRoot` fetches an opaque typed root from prior admitted evidence only.
4. `explainSourceOrigin` answers the user using distinct origin, native intent, and any explicit limits. It must decide when the imported or historical boundary leaves authorship unresolved and when partial current evidence is still useful to the user.
5. `reviewAttributionHandoff` checks scope and head freshness before any conditional local receipt. `retention.writeOwnedReceipt` performs exact persistence and byte readback. Diagnostic reads and disallowed/stale effects yield independent nonmutating proof.
6. The crisp model-free reference independently checks current native state, chosen source fragment and mapped report. A false claim about author, event, path, scope, or native rationale fails even when most of the answer is correct.
