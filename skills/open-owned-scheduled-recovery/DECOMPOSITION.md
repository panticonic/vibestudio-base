# Owned scheduled automation recovery

The entry point receives a user goal for disposable, future-anchored Vibe Studio automations and retained local conversations. Preserve the owner's original operation and audiences across a resumed session.

| Stage | Representation | Reason |
| --- | --- | --- |
| Read current schedules and dependencies | Typed discovery lambda over native Missions port | Schedule names can coincide. State and exact revision come from the current mission. |
| Resolve retained authorization and destination | Typed review lambda over read-only scoped replay | The model must resolve user authorization, prior plans, supersession, dependency requirements, and which local handoff is requested. |
| Decide whether and what to change | Typed planning lambda | Cadence, run caps, pause/resume, already-current case, and unresolved authority are different outcomes. |
| Check the plan against the current native revision and execute | Typed apply lambda calling narrow native ports | The model selects the operation. TypeScript enforces ownership, future anchor, scoped changes, and native revision/idempotency guarantees. |
| Verify the complete affected state | Typed confirmation lambda | The model must compare intended and observed schedule, peers and retained operation. Native readback returns exact timestamps, revisions and observed state. |
| Recover the user's local handoff | Typed handoff lambda calling replay and one durable writer | The model reconciles unknown acknowledgement by reading the target's original message. The writer binds one attempt to the known owned channel, and serializes the observed result. |
| Score independently | Private TypeScript verifier | The oracle reads Missions records/runs and native replay directly, checks primary plus peer effects and no duplicate handoff, and compares the returned user summary to the exact readback. |

## Boundaries

The System Testing worker seeds and pauses its own future-anchored interval fixtures. The retained conversations are disposable owned headless channels. Existing Personal automation monitor code, default mission, and unrelated conversations are outside mutation scope. Scope guards and saved private source provenance are omitted from the task payload. The Missions runtime computes next tick, retains previous charter revisions, and performs transition CAS. Its current edit RPC retains internal CAS and a request idempotency key. The scoped adapter checks the observed revision immediately before issuing an edit and uses an exclusive managed fixture writer. Cross-process edit/nonce atomicity is outside this family.

The Base skill is a self-contained mounted Natlang child. It reuses the native Missions and Agentic replay mechanisms without another workspace module mount. Training readers see only the natural-language runUserGoal invocation and scoped service results. Managed selectors are added to the existing System Testing dispatcher. Qualified outcomes use the existing teacher exporter and exact trajectory checks. Engine/learner formats and model-serving settings are outside this task because they consume the existing capture format unchanged.
