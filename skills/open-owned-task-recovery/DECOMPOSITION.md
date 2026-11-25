# Recover owned agent task work

The user wants to decide what to do with durable task work when participant names, retained attempts, and late acknowledgments disagree. The work is a task recovery decision with optional owned local follow-up.

## Policy

1. Discover relevant task cards, choosing the owning project as well as the display title. Observe the exact current task revision, active owner and attempt, and current prerequisite cards.
2. Discover the live child channels and inspect competing retained receipts. Bind each claimed result to the actual room, original signed sender, addressed participant, message sequence and observed attempt. Missing or unrelated evidence cannot prove completion. Recover the exact eligible terminal outcome when one exists.
3. Choose hold, acknowledge, prepare retry, or change the owned task card using the user's authorization and the prerequisite evidence. A concurrent task change invalidates the previous basis. Reread before replanning.
4. If authorized, discover and resolve the local follow-up recipient, stage the observed task result in that exact room, and recover the original send acknowledgment without replaying the action. Return the actual task outcome and delivery receipt.

## Mechanisms and consumers

- The native Mission Planning Fixture runs the installed Mission Control SQLite task implementation. The managed adapter owns the exact projects and task IDs. Update goes through native expected-revision admission. Prior case authoring never launches agents through the mission runtime.
- The installed local-messaging fixture supplies actual scoped DO senders, recipient participants, channel roster, joined durable PubSub replay, and independent delivery readback. Existing exact checks stay in the reused adapter. Task-recovery receipt content is decoded only after checking the replayed message and actual addressed participant.
- Natlang composes typed recovery, transition, and handoff children. The crisp adapter scopes state, native CAS and original delivery-attempt handling. Native oracle verification independently rereads the task, every protected card and actual delivery lanes. The Host exporter binds outcomes to recorded scoped effects, and excludes unverified references.
- Runnable fixtures and private outcome conditions live in System Testing. The Base workspace mounts the self-contained recovery skill. Personal supplies the owned mission task mechanism. Existing reconciliation, ordinary local delivery, native eval recovery and conversation cursor behavior retain their own entry points.

An accepted receipt identifies its task, owner, attempt and named output; a
filename alone is not the output contents. When the actual receipt includes an
artifact reference, the readArtifact child can read its retained bytes through
the current observed assignment and inspected lane. Use actual contents for
requested values or calculations, and return their actual result reference and
content when requested. Missing output must remain missing, rather than being
inferred from acceptance or a plausible filename. This leaves composition to
the model; it adds no requirement to read contents for identity-only questions.
