# Open local delivery and continuity

The caller supplies their request and the capabilities for an owned set of local
conversations. Conversation titles identify the available work surfaces. A
current roster, retained delivery, and passive receipt can be inspected for any
owned conversation. No caller-assigned steps are passed to the program.

| Stage | Form | Responsibility |
| --- | --- | --- |
| Conversation discovery | Scoped service | Return handles, visible names and local send grants. Preserve exact ownership in an opaque handle. |
| Choose initial scope | Natlang lambda | Pick the conversations that can answer the user's question. Name the recipient phrase only if the goal names one. |
| Inspect | Scoped service | Query the canonical roster, join the channel's durable delivery boundary, and project the exact retained locally addressed message and passive acknowledgments. |
| Replan | Natlang lambda | Decide whether another owned channel is needed when history is incomplete, stale, or tied to a different recipient. |
| Choose a disposition | Natlang lambda | Separate verified completion, partial delivery, clarification, and an authorized current-room follow-up. Select exact observations. |
| Compose | Natlang lambda | Compose the specific requested note. Preserve material facts and keep body names separate from the recipient. |
| Send and read back | Scoped exact service | Bind the selected current roster and exact resolver result to the existing canonical addressed notify path. Retain the actual receipt and verify it against the channel log and passive consumer. |
| Verify | Harness TypeScript | Rejoin every owned channel after closing admission. Read canonical event intervals and actual passive actor state independently. Check receipt identity and prove unsent or protected lanes. |

## Mechanism inventory

- `skills/messaging/local-messaging-service.ts` owns canonical addressee
  snapshots, roster revision guards and exact local addressed notification.
- `system-testing/workers/local-messaging-fixture/index.ts` owns disposable
  channel, sender, and passive recipient actors. They run the native channel
  mechanics without waking inference or an external recipient.
- `system-testing/skills/system-testing/local-messaging/fixture.ts` produces
  caller-selected runs with prebound recipient phrases. The open-goal adapter
  uses the same actors and channels with model-selected rooms and wording.
- `system-testing/skills/system-testing/local-messaging/verify-outcome.mjs`
  checks complete replay and passive recipient identity for one sender. Reuse
  it once for each sender across the same shared independent readback.
- `channel-roster-managed.ts` verifies roster mutation against native state.
  This family covers resolving recipient identity from existing rosters and
  holds. Joining or removing real participants is outside its authorized surface.
- `delivery-history-bindings` and `delivery-history-managed.ts` compare a
  replayed event with renderer/client state. This family compares native replay
  with joined passive recipient state. Renderer verification remains with the
  existing delivery-history workflow.

Each channel has one dedicated current operation lease. A previous operation is
seeded in a different lane or consumes its own lease in the current lane. A
current operation can complete an authorized missing lane without repeating a
committed historical send. An old acknowledgment carries its original channel,
message, sender, recipient and subscription identity.
