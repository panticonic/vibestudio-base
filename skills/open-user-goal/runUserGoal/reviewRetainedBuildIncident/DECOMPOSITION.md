# Retained build performance and diagnostic provenance

| Decision or mechanism | Implementation |
| --- | --- |
| Select a local build incident for the user's scope | The typed root lambda calls selectCheckpoints. It evaluates current target, owned working revision, historical source and ownership, then chooses retained evidence. |
| Compare measurements or assess one retained measurement | The existing System performance/build hierarchy assesses actual report, cache keys, build phases and initial payload. Only its scoped buildPerformance port exposes the selected saved profile. Comparison and hold policies remain typed natural language. |
| Decide what the evidence establishes and what to leave locally | A typed disposition lambda distinguishes timing, cache, payload and precise compiler diagnosis from claims about memory, stale evidence or unclosed traces. Prefer readback when the user asks for no writing. |
| Preserve source provenance | A crisp SST adapter creates small disposable units and captures their native profile behind an owned VCS head, preserving actual native state and build key. Native VCS readback and immutable build metadata attest the retained checkpoints. Incomplete or withdrawn checkpoints cannot authorize an action. Common measurement projection is reused from the installed System service. |
| Save and independently verify an authorized local note | Scoped scratch mechanism emits a canonical report containing both exact source identity and native performance evidence. A private verifier independently rereads checkpoint files, VCS state, diagnostic coordinates, any native immutable metadata and exact scratch bytes. It attests no publication and no changes to the protected main head. |

The producer separates timestamped release/workspace context from global build event lists. Only the explicitly owned checkpoint is usable as evidence. Runtime stack, trajectory format and training readers are unchanged. This wave authors managed build references. It does not run a managed build, collect a teacher or change compiler policy.
