# Vibestudio VCS: what is natural language and what is crisp

Ported sub-procedure: the next step for a typed VCS error (`typedRecovery`). Conflict resolution, revert, and push stay with the agent (judgment over merges and publication).

| Part | Form | Why |
| --- | --- | --- |
| Error code and fields to next step | **crisp** table, `typedRecovery(error, { operation })` | The skill's own rule is "act on the structured error code and fields. Messages explain; don't parse them." A closed code union validated by zod (`vcsErrorSchema`) maps to one documented step, so a model would only add a way to be wrong. The table is exhaustive: `typedRecovery.test.ts` fails when the service gains a code without an entry, and when `references/typed-recovery.md` and the table disagree. Policy-as-natural-language is for decisions that need interpretation; this one is a dispatch the service itself defines. |
| ConflictPresent from a merge versus from a revert | the `operation` argument | Typed, known to the caller. |
| Filling the step with the error's values (group id, maximum, unaccounted count) | crisp, in the same function | Read from fields, never from the message. |
| Choosing `theirs`, `ours`, or `current` for a conflict | stays an agent procedure | Requires reading both intents and the combined state. |
| An unrecognized code | reported (`report-unrecognized-code`, `stop: true`) | Honest terminal result, not a guess. |

Measured against the executor: not applicable. There is no model call, so there is no executor baseline; the oracle is the table and its exhaustiveness test.
